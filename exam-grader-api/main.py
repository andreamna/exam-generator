from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import shutil
from exam_grader import run_exam_grading

app = FastAPI()

@app.post("/grade")
async def grade_exam(student_file: UploadFile = File(...), answer_key: UploadFile = File(...)):
    with open("student.jpg", "wb") as f:
        shutil.copyfileobj(student_file.file, f)

    with open("answer_key.pdf", "wb") as f:
        shutil.copyfileobj(answer_key.file, f)

    try:
        result = run_exam_grading("student.jpg", "answer_key.pdf")
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
