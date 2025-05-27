const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const {PDFDocument} = require("pdf-lib");
const db = require("./db/database");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

//Creating disk storage for grading exam documents upload
const answerKeyStorage = multer.diskStorage({
    destination: "./answerKey",
    filename: (req, file, cb) =>{
            cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
        }
})

const studentExamStorage = multer.diskStorage({
    destination: "./examPapers",
    filename: (req, file, cb) =>{
            cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
        }
})

//Creating disk storage for generating exam documents upload
const lectureMaterials = multer.diskStorage({
    destination: "./lectureMaterials",
    filename: (req, file, cb) =>{
            cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
        }
})

//Initializing multer objects
const uploadAnswerKey = multer({storage: answerKeyStorage});
const uploadStudentExam = multer({storage: studentExamStorage});
const uploadLectureMaterials = multer({storage: lectureMaterials});

app.get("/", (req, res) =>{

})

app.post("/answerKey/upload", uploadAnswerKey.single("answerKey"), (req, res) => {
    console.log("Files uploaded succesfully!")
    const file = fs.createReadStream(req.file.path);
    //Making post request to grading module
})

app.post("/examPapers/upload", uploadStudentExam.array("examPapers", 60), (req, res) => {
    for(const file of req.files){
        const file_ = fs.createReadStream(file.path);
        //Making post request to grading module
    }
})

app.post("/lectureMaterials/upload", uploadLectureMaterials.array("lectureMaterials", 30), (req, res) => {
    for(const file of req.files){
        const fileBuffer = fs.readFileSync(file.path);
        const subFiles = splitPDF(file.path, 25);
        const fileName = path.parse(file.path).name;

        const formData = new FormData();

        for(let i = 0; i<subFiles; i++){
            formData.append('__TBD__', fs.createReadStream(`./${fileName}_chunks/chunk_${i + 1}.pdf`))
        }
        ////Making post request to exam generator moduler
    }
})

app.post("/users", (req, res) =>{
    db.run("INSERT INTO users (id, name, email, password) values (?, ?, ?, ?)", [req.body.id, req.body.name, req.body.email, req.body.password], (err) =>{
        if (err){
            res.send("Error at insertion operation");
        }
        else{
            res.send("Succesful insertion");
        }
    })
})

app.post("/login", (req, res) =>{
    const id = req.body.id;
    const password = req.body.password;

    db.get("SELECT * FROM users WHERE id = (?)", [id], (err, row)=>{
        if (!row){
            res.send("Not found");
        }
        else{
            if (row.password != password){
                res.send("Not found");
            }
        }
    })
})

//Function for splitting files
async function splitPDF(path, pages){
    const pdfBytes = fs.readFileSync(path);
    const originalPDF = await PDFDocument.load(pdfBytes);

    const totalPages = originalPDF.getPageCount();
    let chunkIndex = 0;

    const fileName = path.parse(path).name;
    for(let i = 0; i<totalPages; i+=pages){
        const newPDF = await PDFDocument.create();
        const end = (i + pages) < totalPages? i + pages:totalPages;

        const pagesToCopy = await newPDF.copyPages(originalPDF, [...Array(end - i).keys()].map(x => x + i));
        pagesToCopy.forEach(p => newPDF.addPage(p));

        const newPDFbytes = await newPDF.save();
        const outputPath = `./${fileName}_chunks/chunk_${chunkIndex + 1}.pdf`;
        fs.writeFileSync(outputPath, newPDFbytes);

        console.log(`Created: ${outputPath}`);
        chunkIndex++;
    }

    return chunkIndex;
}
// path.parse(path).name
app.listen(3000, (req, res)=>{
    console.log("App listening at 3000");
})