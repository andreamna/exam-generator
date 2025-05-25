from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
from transformers import pipeline

summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")

app = Flask(__name__)

def extract_text_from_html(html):
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(separator=" ", strip=True)

@app.route("/summarize", methods=["POST"])
def summarize():
    try:
        data = request.get_json()
        html_docs = data.get("html_docs")

        if not html_docs or not isinstance(html_docs, list):
            return jsonify({"error": "Invalid or missing 'html_docs' list"}), 400

        summaries_dict = {}
        for i, html in enumerate(html_docs):
            text = extract_text_from_html(html)
            summary = summarizer(text, max_length=150, min_length=30, do_sample=False)[0]["summary_text"]
            summaries_dict[f"Lesson {i+1}"] = summary

        return jsonify({"summaries": summaries_dict})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860)
