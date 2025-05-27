import os
import json
import requests
import re
from bs4 import BeautifulSoup

# ---- API Configuration ---- #
API_KEY = os.getenv("UPSTAGE_API_KEY")
if not API_KEY:
    raise ValueError("Missing UPSTAGE_API_KEY environment variable.")

HEADERS = {"Authorization": f"Bearer {API_KEY}"}
OCR_URL = "https://api.upstage.ai/v1/document-digitization"
DOC_PARSER_URL = "https://api.upstage.ai/v1/document-digitization"
from openai import OpenAI
SOLAR_CLIENT = OpenAI(api_key=API_KEY, base_url="https://api.upstage.ai/v1")

# ---- OCR Function ---- #
def ocr_image(file_like):
    files = {"document": (getattr(file_like, 'name', 'file'), file_like)}
    data = {"model": "ocr"}
    response = requests.post(OCR_URL, headers=HEADERS, files=files, data=data)
    response.raise_for_status()
    return response.json()

# ---- Extract Answers from Answer Key ---- #
def detect_type(ans: str) -> str:
    ans_clean = ans.strip().lower()
    if re.fullmatch(r'[a-fA-F]', ans.strip()):
        return "mcq"
    if ans_clean in ["true", "false"]:
        return "tf"
    if re.fullmatch(r'[\d\s\.,%$+-]+', ans_clean):
        return "numerical"
    return "short"

def extract_answers_from_pdf(filename: str) -> list:
    if not os.path.exists(filename):
        raise FileNotFoundError(f"{filename} not found.")

    with open(filename, "rb") as file:
        files = {"document": file}
        data = {
            "ocr": "force",
            "base64_encoding": "['table']",
            "model": "document-parse"
        }
        response = requests.post(DOC_PARSER_URL, headers=HEADERS, files=files, data=data)
        response.raise_for_status()
        result = response.json()

    html_content = result.get("content", {}).get("html", "")
    soup = BeautifulSoup(html_content, "html.parser")

    answers = []
    for row in soup.find_all("tr"):
        cols = row.find_all("td")
        if len(cols) >= 2:
            answer_text = cols[1].text.strip()
            answer_type = detect_type(answer_text)
            answers.append({
                "question": len(answers) + 1,
                "answer": answer_text,
                "type": answer_type
            })
    return answers

# ---- Extract Questions from HTML ---- #

# ---- Extract Student Answers Using Solar ---- #
def extract_answers_from_context_with_solar(context_text):
    prompt = (
        "You are an expert exam parser.\n"
        "Extract all questions and student's answers from the following exam OCR text.\n"
        "Return a JSON array with: question_number, question, answer.\n"
        "For MCQs, answer must be only A/B/C/D. For others, return the full student response.\n"
        f"Context:\n{context_text}\n\nExtracted JSON:"
    )

    response = SOLAR_CLIENT.chat.completions.create(
        model="solar-pro",
        messages=[{"role": "user", "content": prompt}],
        stream=False
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```json"): content = content[len("```json"):].strip()
    if content.endswith("```"    ): content = content[:-3].strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return []

# ---- Grading ---- #
def solar_score(student_ans, correct_ans):
    prompt = (
        f"You are an exam grading AI.\n"
        f"Sometimes the student's answer may contain spacing or formatting errors due to OCR or parsing mistakes.\n"
        f"Your job is to evaluate the actual meaning. If the student's answer is actually correct but formatted wrong (like '1 2' instead of '12'), treat it as correct.\n"
        f"Given the student's answer and the correct answer, return how accurate the student's answer is.\n"
        f"Only return a number from 0 to 100 (no % sign).\n\n"
        f"Correct Answer: {correct_ans}\n"
        f"Student Answer: {student_ans}\n\n"
        f"Score (0-100):"
    )

    response = SOLAR_CLIENT.chat.completions.create(
        model="solar-pro",
        messages=[{"role": "user", "content": prompt}],
        stream=False
    )

    content = response.choices[0].message.content.strip()
    match = re.search(r"(\d{1,3})(?!\d)", content)
    if match:
        score = int(match.group(1))
        return max(0, min(score, 100)) / 100.0
    else:
        return 0.0
    
def grade_question(student_ans, correct_ans, qtype="short"):
    if student_ans is None or student_ans == "" or correct_ans is None or correct_ans == "":
        return 0.0, "No answer provided"

    if qtype == "short":
        score = solar_score(student_ans, correct_ans)
        return score, f"{int(score * 100)}% similarity (via Solar AI)"

    elif qtype == "mcq":
        correct = student_ans.strip().upper() == correct_ans.strip().upper()
        return (1.0 if correct else 0.0), "Multiple choice"

    elif qtype == "truefalse":
        correct = student_ans.strip().lower() == correct_ans.strip().lower()
        return (1.0 if correct else 0.0), "True/False"

    elif qtype == "numerical":
        try:
            correct = abs(float(student_ans) - float(correct_ans)) <= 0.01
            return (1.0 if correct else 0.0), "Numerical"
        except:
            return 0.0, "Invalid number format"

    else:
        return 0.0, "Unsupported question type"

def grade_exam(student_answers, model_answers):
    graded = []
    for student in student_answers:
        q_num = student["question_number"]
        stu_ans = student["answer"]
        model = model_answers.get(q_num, {})
        correct = model.get("answer")
        q_type = model.get("type", "short")

        score, feedback = grade_question(stu_ans, correct, q_type)

        result = {
            "question": student["question"],
            "student_answer": stu_ans,
            "expected_answer": correct,
            "score": score
        }

        if q_type == "short":
            result["feedback"] = feedback

        graded.append(result)
    return graded


# ---- Wrapper Function ---- #
def run_exam_grading(student_image_path, model_answer_file):
    with open(student_image_path, "rb") as f:
        ocr_result = ocr_image(f)
    student_text = ocr_result.get("text", "").strip()
    student_answers = extract_answers_from_context_with_solar(student_text)

    model_answer_list = extract_answers_from_pdf(model_answer_file)

    model_answers = {
        item["question"]: {"answer": item["answer"], "type": item["type"]}
        for item in model_answer_list
    }

    return grade_exam(student_answers, model_answers)
