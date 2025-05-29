from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from typing import List
import shutil
import os
from uuid import uuid4
import json

# Import your functions
from generator import parse_multiple_pdfs, summarize_from_json_input, interactive_question_generation

app = FastAPI()

UPLOAD_DIR = "/tmp/uploaded_pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/generate_exam/")
async def generate_exam(
    files: List[UploadFile] = File(...),
    detail_level: str = Form("medium"),
    question_counts: str = Form(...)  # JSON string mapping original filenames to question counts
):
    file_paths = []
    filename_to_saved_path = {}

    try:
        # Parse question_counts JSON string (original filenames as keys)
        question_settings_raw = json.loads(question_counts)
    except json.JSONDecodeError:
        return JSONResponse(content={"error": "Invalid JSON format in question_counts"}, status_code=400)

    # Save uploaded files and track filename mapping
    for file in files:
        unique_name = f"{uuid4()}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        file_paths.append(file_path)
        filename_to_saved_path[file.filename] = file_path

    try:
        # Step 1: Parse and summarize
        parsed_data = parse_multiple_pdfs(file_paths)
        summaries = summarize_from_json_input(parsed_data, detail_level=detail_level)

        # Step 2: Map original filenames to upload_number by stripping UUID prefix
        filename_to_upload_number = {}
        for path, summary in zip(file_paths, summaries["summaries"]):
            saved_filename = os.path.basename(path)  # e.g. "c4a9e25b-e39f-4c49-a386-dc2c9378ea27_Week6.pdf"
            # Extract original filename after the first underscore
            original_filename = saved_filename.split("_", 1)[1] if "_" in saved_filename else saved_filename
            upload_num = summary["upload_number"]
            filename_to_upload_number[original_filename] = upload_num

        # Step 3: Build question_settings keyed by upload_number
        question_settings = {}
        for original_filename, settings in question_settings_raw.items():
            upload_number = filename_to_upload_number.get(original_filename)
            if upload_number:
                question_settings[upload_number] = settings

        # Step 4: Generate exam questions
        question_data = interactive_question_generation(summaries, question_settings)

        return JSONResponse(content=question_data)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
