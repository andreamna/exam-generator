require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const FormData = require("form-data")

//Function to extract answers from answerKey
function getAnswers(rawHTML){
    let answersArray = {};
    
    const $ = cheerio.load(rawHTML);
    const text = $('p').html();

    let unfilteredArray = text.split("<br>");

    for(let i = 0; i<unfilteredArray.length; i++){
        answersArray[i] = filtering(unfilteredArray[i]);
    }

    return answersArray;

    function filtering(subString){
        return subString.substring(subString.indexOf(")")+1);
    }
}

const app = express();

app.use( (req, res, next) =>{
    res.header('Access-Control-Allow-Origin', '*');
    next();
})

app.use(express.static(path.join(__dirname, "frontend")));

app.get("/", (req, res)=>{

})

const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) =>{
        cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
    }
})

const upload = multer({storage: storage});

app.post("/uploads", upload.array("documents", 60), async (req, res) =>{
    console.log("Files have been uploaded successfully!");

    let responseObj = {};
    let counter = 0;
    for(const file of req.files) {
        const form = new FormData();
        form.append("document", fs.createReadStream(file.path));
        let response = await axios.post("https://api.upstage.ai/v1/document-ai/document-parse", form, {
            headers:{
                Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`,
                ...form.getHeaders()
            },
        })
        responseObj[counter++] = response.data.content.html;
    }
    res.json(responseObj);

})

const answerKeystorage = multer.diskStorage({
    destination: "./answerKey",
    filename: (req, file, cb) =>{
        cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
    }
})

const answerKeyUpload = multer({storage: answerKeystorage})

app.post("/uploadAnswerKey", answerKeyUpload.single("document"), async (req, res)=>{
    const form = new FormData();
    form.append("document", fs.createReadStream(req.file.path));
    let response = await axios.post("https://api.upstage.ai/v1/document-ai/document-parse", form, {
        headers:{
            Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`,
            ...form.getHeaders()
        }
    })
    const rawAnswers = response.data.content.html;
    res.json(getAnswers(rawAnswers));
})

app.listen(3000, ()=>{
    console.log("App listening at port 3000");
})