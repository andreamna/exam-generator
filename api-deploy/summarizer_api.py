from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
from transformers import pipeline, AutoTokenizer
import re

app = Flask(__name__)

model_name = "facebook/bart-large-cnn"
summarizer = pipeline("summarization", model=model_name)
tokenizer = AutoTokenizer.from_pretrained(model_name)

MAX_INPUT_TOKENS = 1024 

def extract_text_from_html(html):
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(separator=" ", strip=True)

def preprocess_slides(html_input):
    slides = html_input.split("</footer>")
    slides = [slide.strip() + "</footer>" for slide in slides if slide.strip()]
    return slides

def split_text_by_tokens(text, max_tokens=1024):
    inputs = tokenizer(text, return_overflowing_tokens=True, max_length=max_tokens, truncation=True, stride=0)
    input_ids_list = inputs["input_ids"] if isinstance(inputs["input_ids"][0], list) else [inputs["input_ids"]]
    return [tokenizer.decode(ids, skip_special_tokens=True) for ids in input_ids_list]

def clean_text(text):
    text = re.sub(r'[^\x00-\x7F\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def summarize_text(text, detail_level="medium"):
    level_config = {
        "short": {"max_length": 60, "min_length": 20},
        "medium": {"max_length": 120, "min_length": 40},
        "detailed": {"max_length": 200, "min_length": 80}
    }

    config = level_config.get(detail_level.lower(), level_config["medium"])
    summaries = []
    chunks = split_text_by_tokens(text, max_tokens=MAX_INPUT_TOKENS)

    for chunk in chunks:
        try:
            if chunk.strip():
                output = summarizer(
                    chunk,
                    max_length=config["max_length"],
                    min_length=config["min_length"],
                    do_sample=False
                )
                summaries.append(output[0]["summary_text"])
        except Exception as e:
            summaries.append(f"[Error summarizing: {str(e)}]")
    return " ".join(summaries)

@app.route("/summarize", methods=["POST"])
def summarize():
    try:
        data = request.get_json()
        html_docs = data.get("html_docs")
        detail_level = data.get("detail", "medium")

        if not html_docs or not isinstance(html_docs, list):
            return jsonify({"error": "Invalid or missing 'html_docs' list"}), 400

        summaries_dict = {}
        for i, html in enumerate(html_docs):
            slide_chunks = preprocess_slides(html)
            lesson_summaries = []

            for chunk in slide_chunks:
                text = clean_text(extract_text_from_html(chunk))
                if len(text.strip()) > 20:
                    summary = summarize_text(text, detail_level=detail_level)
                    lesson_summaries.append(summary)

            summaries_dict[f"Lesson {i+1}"] = " ".join(lesson_summaries)

        return jsonify({"summaries": summaries_dict})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860)
