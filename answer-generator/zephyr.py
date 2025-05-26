import json
import os
from llama_cpp import Llama

def generate_section(llm, context, count, section_type):
    base_prompt = f'''
You are an exam question generator. Based on the context below, generate {count} {section_type} exam questions.

Context:
\"\"\"{context}\"\"\"

Output format:
'''

    if section_type == "Multiple Choice":
        prompt = base_prompt + f'''
### Multiple Choice

For each question, follow this exact format strictly (no extra text, no explanations):

Question: <question text>
Answer choices:
A. Option 1
B. Option 2
C. Option 3
D. Option 4
Answer: <correct letter>

Repeat for all {count} questions.
'''
    elif section_type == "True/False":
        prompt = base_prompt + f'''
### True/False

For each question, follow this exact format strictly:

Question: <statement>
Answer: <True or False>

Repeat for all {count} questions.
'''
    elif section_type == "Short Answer":
        prompt = base_prompt + f'''
### Short Answer

For each question, follow this exact format strictly:

Question: <question text>
Answer: <concise sample answer>

Repeat for all {count} questions.
'''
    elif section_type == "Essay":
        prompt = base_prompt + f'''
### Essay

For each question, follow this exact format strictly:

Question: <essay question>

Repeat for all {count} questions.
'''

    result = llm(prompt, max_tokens=1024, stop=["</s>"])
    return result["choices"][0]["text"].strip()



def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_choice = "zephyr"
    model_file = "zephyr-7b-alpha.Q2_K.gguf"
    model_path = os.path.join(base_dir, "models", model_choice, model_file)

    print("Loading model...")
    llm = Llama(model_path=model_path, n_ctx=2048, n_threads=8)

    with open("summaries.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    output_data = {"raw_question_outputs": []}

    print("\nPlease enter the number of questions for each type (applies to all uploads):")
    while True:
        try:
            mcq_count = int(input("Number of multiple choice questions: "))
            tf_count = int(input("Number of true/false questions: "))
            sa_count = int(input("Number of short answer questions: "))
            se_count = int(input("Number of short essay questions: "))
            break
        except ValueError:
            print("Please enter valid integers.")

    for item in data["summaries"]:
        upload_num = item["upload_number"]
        context = item["context"]
        print(f"\nGenerating for upload number {upload_num}...")

        output_sections = []

        try:
            if mcq_count > 0:
                print("  Generating MCQs...")
                output_sections.append(generate_section(llm, context, mcq_count, "Multiple Choice"))

            if tf_count > 0:
                print("  Generating True/False...")
                output_sections.append(generate_section(llm, context, tf_count, "True/False"))

            if sa_count > 0:
                print("  Generating Short Answer...")
                output_sections.append(generate_section(llm, context, sa_count, "Short Answer"))

            if se_count > 0:
                print("  Generating Essay...")
                output_sections.append(generate_section(llm, context, se_count, "Essay"))

        except Exception as e:
            print(f"Failed to generate for upload {upload_num}: {e}")
            continue

        raw_output = "\n\n".join(output_sections)

        output_data["raw_question_outputs"].append({
            "upload_number": upload_num,
            "raw_output": raw_output
        })

        print(f"Done with upload {upload_num}.")

    with open("raw_questions.txt", "w", encoding="utf-8") as f_out:
        for entry in output_data["raw_question_outputs"]:
            f_out.write(f"=== Upload {entry['upload_number']} ===\n")
            f_out.write(entry["raw_output"] + "\n\n")

    with open("raw_questions.json", "w", encoding="utf-8") as f_out_json:
        json.dump(output_data, f_out_json, indent=2, ensure_ascii=False)

    print("\nAll questions generated and saved to 'raw_questions.txt' and 'raw_questions.json'.")

if __name__ == "__main__":
    main()
