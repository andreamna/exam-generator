const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data")

const app = express();

//Class to store and handle exam answers by student
class Student{
    constructor(name, id, answers){
        this.name = name;
        this.id = id;
        this.answers = answers;
    }
}

//Function to getAnswers from rawHTML
function getAnswers(content){
    const lines = content.split("<br>");
    let answers = [];

    for(let i = 0; i<lines.length; i++){
        if (i % 2 != 0){
            answers.push(lines[i].trim());
        }
    }

    return answers;
}

app.use( (req, res, next) =>{
    res.header('Access-Control-Allow-Origin', '*');
    next();
})

const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) =>{
        cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
    }
})

const upload = multer({storage: storage});

app.post("/uploads", upload.single("document"), async (req, res) =>{
    console.log("File has been uploaded successfully!");

    const filePath = req.file.path;
    const form = new FormData();
    form.append("document", fs.createReadStream(filePath));

    const response = await axios.post("https://api.upstage.ai/v1/document-ai/document-parse", form, {
        headers:{
            Authorization: `Bearer up_zP6g7rXdjCuEx2XGrUT6NECpvHQsP`,
            ...form.getHeaders()
        },
    })

    //Handling Document parser API response (rawHTML)
        let $ = cheerio.load(response.data.content.html);
    
        studentName = $("tbody td").first().html();
        studentID = $("tbody td").eq(1).html();
        
        paragraphContent = $("p").html();
    
        studentAnswers = getAnswers(paragraphContent);
    
        //Creating an object to store the info from each exam paper
        let student = new Student(studentName, studentID, studentAnswers);
    
        res.json({
            studentName: student.name,
            studentID : student.id,
            answers : student.answers
        })
})

app.get("/", (req, res)=>{
    res.json({message: "Hello, World!"});
})

app.listen(3000, ()=>{
    console.log("App listening at port 3000");
})