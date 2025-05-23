from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer, util
from transformers import pipeline
from rake_nltk import Rake
import torch

app = Flask(__name__)

model = SentenceTransformer('princeton-nlp/sup-simcse-bert-base-uncased')

nli_pipeline = pipeline("text-classification", model="roberta-large-mnli")

def get_similarity(student_ans, correct_ans):
    embeddings = model.encode([student_ans, correct_ans], convert_to_tensor=True)
    return util.pytorch_cos_sim(embeddings[0], embeddings[1]).item()

def contradiction_check(student_ans, correct_ans):
    input_text = student_ans.strip() + " </s></s> " + correct_ans.strip()
    result = nli_pipeline(input_text)[0]
    return result['label']

def extract_keywords(text):
    rake = Rake()
    rake.extract_keywords_from_text(text)
    return [phrase.lower() for phrase in rake.get_ranked_phrases()]

def keyword_match(student_ans, rake_keywords, threshold=0.7):
    matched = []
    student_chunks = student_ans.lower().split()

    windows = []
    for i in range(len(student_chunks) - 1):
        windows.append(" ".join(student_chunks[i:i+2]))
    for i in range(len(student_chunks) - 2):
        windows.append(" ".join(student_chunks[i:i+3]))

    for keyword in rake_keywords:
        for chunk in windows:
            score = get_similarity(chunk, keyword)
            if score >= threshold:
                matched.append(keyword)
                break
    return matched

def hybrid_grade(student_ans, correct_ans, min_match=1):
    keywords = extract_keywords(correct_ans)
    sim_score = get_similarity(student_ans, correct_ans)
    matched_keywords = keyword_match(student_ans, keywords)

    nli_label = contradiction_check(student_ans, correct_ans)
    if nli_label == "CONTRADICTION":
        return "Incorrect", sim_score, "Contradiction detected"

    if sim_score >= 0.70:
        return "Correct", sim_score, "High semantic similarity"
    elif sim_score >= 0.45 and len(matched_keywords) >= min_match:
        return "Partially Correct", sim_score, "Medium similarity with some keyword match"
    else:
        return "Incorrect", sim_score, "Low similarity and low keyword match"

def grade_question(student_ans, correct_ans, qtype="short"):
    if qtype == "short":
        return hybrid_grade(student_ans, correct_ans)
    
    elif qtype == "mcq":
        return (
            "Correct" if student_ans.strip().upper() == correct_ans.strip().upper() 
            else "Incorrect"
        ), 1.0, "Multiple choice"
    
    elif qtype == "truefalse":
        return (
            "Correct" if student_ans.strip().lower() == correct_ans.strip().lower() 
            else "Incorrect"
        ), 1.0, "True/False"

    elif qtype == "numerical":
        try:
            return (
                "Correct" if abs(float(student_ans) - float(correct_ans)) <= 0.01 
                else "Incorrect"
            ), 1.0, "Numerical match"
        except:
            return "Invalid Answer", 0.0, "Could not parse numerical answer"
    
    else:
        return "Unknown", 0.0, "Unsupported question type"

def grade_exam(student_answers: dict, model_answers: dict) -> dict:
    results = {}
    for qid, student_ans in student_answers.items():
        if qid not in model_answers:
            results[qid] = {"grade": "Unknown", "score": 0.0, "reason": "No model answer"}
            continue

        model_info = model_answers[qid]
        correct_ans = model_info["answer"]
        qtype = model_info.get("type", "short")

        grade, score, reason = grade_question(student_ans, correct_ans, qtype)
        results[qid] = {"grade": grade, "score": score, "reason": reason}
    
    return results

@app.route("/grade", methods=["POST"])
def grade():
    data = request.json
    student_answers = data["student_answers"]
    model_answers = data["model_answers"]
    
    result = grade_exam(student_answers, model_answers)
    return jsonify(result)

if __name__ == "__main__":
    app.run(port=5000, debug=True)