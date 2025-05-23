from flask import Flask, request, jsonify
from grader import grade_exam

app = Flask(__name__)

@app.route("/grade", methods=["POST"])
def grade():
    try:
        data = request.get_json()

        student_answers = data.get("student_answers")
        model_answers = data.get("model_answers")

        if not student_answers or not model_answers:
            return jsonify({"error": "Missing student_answers or model_answers"}), 400

        results = grade_exam(student_answers, model_answers)
        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
