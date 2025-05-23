const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data")

const app = express();

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

    res.json({parsedHtml: response.data});


})

app.get("/", (req, res)=>{
    res.json({message: "Hello, World!"});
})

app.listen(3000, ()=>{
    console.log("App listening at port 3000");
})