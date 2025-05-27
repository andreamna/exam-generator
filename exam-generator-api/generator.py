
import os
import requests
from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor
import re
from bs4 import BeautifulSoup
import json

client = OpenAI(
    api_key=os.getenv("UPSTAGE_API_KEY"),
    base_url="https://api.upstage.ai/v1"
)

def parse_single_pdf(pdf_path, upload_number):
    """Parses a single PDF file using Upstage's document parser API."""
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"File not found: {pdf_path}")

    url = "https://api.upstage.ai/v1/document-digitization"
    headers = {"Authorization": f"Bearer {client.api_key}"}

    with open(pdf_path, "rb") as file:
        files = {"document": file}
        data = {
            "ocr": "force",
            "base64_encoding": "['table']",
            "model": "document-parse"
        }

        try:
            response = requests.post(url, headers=headers, files=files, data=data)
            response.raise_for_status()
            html_content = response.json().get("content", {}).get("html", "")
            return {
                "upload_number": upload_number,
                "context": html_content
            }
        except requests.RequestException as e:
            print(f"Error parsing PDF #{upload_number}: {e}")
            return {
                "upload_number": upload_number,
                "context": ""
            }

def parse_multiple_pdfs(pdf_paths):
    """Parses multiple PDF files in parallel and returns structured results."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parsed_results = []

    def process_file(idx_path):
        idx, rel_path = idx_path
        abs_path = os.path.join(base_dir, rel_path)
        return parse_single_pdf(abs_path, upload_number=idx)

    with ThreadPoolExecutor() as executor:
        results = executor.map(process_file, enumerate(pdf_paths, start=1))

    for result in results:
        parsed_results.append(result)

    print("All PDFs parsed successfully.")
    return parsed_results

def extract_text_from_html(html):
    """Extracts text from HTML content."""
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(separator=" ", strip=True)

def preprocess_slides(html_input):
    """Preprocess HTML into individual slides."""
    slides = html_input.split("</footer>")
    slides = [slide.strip() + "</footer>" for slide in slides if slide.strip()]
    return slides

def clean_text(text):
    """Cleans the extracted text to remove unnecessary characters."""
    text = re.sub(r'[^\x00-\x7F\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def summarize_with_solar_batch(texts, detail_level="medium"):
    """Summarize multiple slides in a batch using Solar AI."""
    level_instruction = {
        "short": "Summarize briefly in 100 word.",
        "medium": "Summarize the content clearly and concisely in 100-250 words.",
        "detailed": "Summarize in detail with key points covered in 250-400 words."
    }
    instruction = level_instruction.get(detail_level.lower(), level_instruction["medium"])

    prompt = f"{instruction}\n\nContent:\n\"\"\"\n"
    prompt += "\n\n".join(texts)
    prompt += "\n\"\"\"\n\nSummary:"

    try:
        response = client.chat.completions.create(
            model="solar-pro",
            messages=[{"role": "user", "content": prompt}],
            stream=False
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"[Error summarizing: {str(e)}]"

def summarize_html_slides_batch(html_data: str, detail_level="medium", upload_number=1, batch_size=5):
    """Summarize HTML slide content using Solar AI in batches."""
    slides = preprocess_slides(html_data)
    summaries = []
    batch = []

    for idx, chunk in enumerate(slides, start=1):
        text = clean_text(extract_text_from_html(chunk))
        if len(text.strip()) > 20:
            batch.append(text)
        if len(batch) >= batch_size or idx == len(slides):
            batch_summary = summarize_with_solar_batch(batch, detail_level)
            summaries.append(batch_summary)
            batch.clear()

    combined_summary = " ".join(summaries)

    json_output = {
        "summaries": [
            {
                "upload_number": upload_number,
                "context": combined_summary
            }
        ]
    }

    return json_output, combined_summary

def summarize_from_json_input(json_input: list, detail_level="medium"):
    all_summaries = []

    with ThreadPoolExecutor() as executor:
        results = executor.map(lambda entry: summarize_html_slides_batch(entry["context"], detail_level, entry["upload_number"]), json_input)

    for result in results:
        all_summaries.extend(result[0]["summaries"])

    print("\nAll documents summarized in parallel.")
    return {"summaries": all_summaries}

def clean_json_response(text):
    # Remove triple backticks and optional 'json' label
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"```$", "", text)
    return text.strip()

def generate_section(context, count, section_type, start_q_number):
    base_prompt = f'''
You are an exam question generator. Based on the context below, generate {count} {section_type} exam questions.

Context:
\"\"\"{context}\"\"\"

Return the result as a valid JSON array where each item has these fields:
- question_number (starting from {start_q_number})
- context (the question text)
- answer (the correct answer)
- type (must be "{section_type}")

For Multiple Choice questions, also include a "choices" field with keys "A", "B", "C", "D".

Example format for Multiple Choice:
[
  {{
    "question_number": {start_q_number},
    "context": "Your question text here",
    "choices": {{
      "A": "Option 1",
      "B": "Option 2",
      "C": "Option 3",
      "D": "Option 4"
    }},
    "answer": "A",
    "type": "Multiple Choice"
  }}
]

Example format for True/False, Short Answer, Essay (no choices field):
[
  {{
    "question_number": {start_q_number},
    "context": "Your question text here",
    "answer": "Correct answer here",
    "type": "{section_type}"
  }}
]

Only return the JSON array. No explanations or additional text.
'''

    response = client.chat.completions.create(
        model="solar-pro",
        messages=[{"role": "user", "content": base_prompt}],
        stream=False,
    )

    raw_output = response.choices[0].message.content.strip()
    clean_output = clean_json_response(raw_output)

    try:
        questions = json.loads(clean_output)
        return questions
    except Exception as e:
        raise ValueError(f"Invalid JSON output: {e}\n\nReturned content:\n{raw_output}")

def interactive_question_generation(summaries_json, question_settings):
    """
    summaries_json: Output of summarize_from_json_input()
    question_settings: A dict mapping upload_number to question counts, e.g.
        {
            1: {"mcq": 3, "tf": 2, "sa": 1, "num": 1},
            2: {"mcq": 2, "tf": 2, "sa": 2, "num": 0}
        }
    """
    output_data = {"exam": []}

    for item in summaries_json.get("summaries", []):
        upload_num = item["upload_number"]
        context = item["context"]

        settings = question_settings.get(upload_num, {"mcq": 0, "tf": 0, "sa": 0, "num": 0})
        mcq = settings.get("mcq", 0)
        tf = settings.get("tf", 0)
        sa = settings.get("sa", 0)
        num = settings.get("num", 0)

        all_questions = []
        current_q_num = 1

        try:
            if mcq > 0:
                questions = generate_section(context, mcq, "Multiple Choice", current_q_num)
                all_questions.extend(questions)
                current_q_num += mcq

            if tf > 0:
                questions = generate_section(context, tf, "True/False", current_q_num)
                all_questions.extend(questions)
                current_q_num += tf

            if sa > 0:
                questions = generate_section(context, sa, "Short Answer", current_q_num)
                all_questions.extend(questions)
                current_q_num += sa

            if num > 0:
                questions = generate_section(context, num, "Numerical", current_q_num)
                all_questions.extend(questions)
                current_q_num += num

        except Exception as e:
            all_questions.append({"error": str(e)})

        output_data["exam"].append({
            "upload_number": upload_num,
            "questions": all_questions
        })

    return output_data

def get_exam_questions(pdfs, detail_level="medium"):
    
    parsed = parse_multiple_pdfs(pdfs)
    
    summarized = summarize_from_json_input(parsed, detail_level=detail_level)

    question_data = interactive_question_generation(summarized)

    return question_data

if __name__ == "__main__":
    # Example usage
    file_paths = [
    "exam-generator-api/Week6.pdf"
    ]

    exam_questions = get_exam_questions(file_paths, detail_level="short")
    print(exam_questions)
