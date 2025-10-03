import express from "express";
import {createServer} from "node:http";

import {Server} from "socket.io";
import cors from "cors";
import mongoose from "mongoose";
import userRoutes from "./routes/users.routes.js"
import {connectToSocket} from "./controllers/socketManager.js"; 
const app=express();
const server=createServer(app);
const io=connectToSocket(server); 

app.set("port",(process.env.PORT || 8000));
app.use(cors());
app.use(express.json({limit:"40kb"}))
app.use(express.urlencoded({limit:"40kb",extended:true}));

app.get("/home",(req,res)=>{
         return res.json({"hello":"world"});
});

app.use("/api/v1/users",userRoutes);
 

const start=async()=>{
    const connectionDb=await mongoose.connect("mongodb+srv://vighneshtakke4_db_user:takke@cluster0.ynxcejx.mongodb.net/");
    console.log(`Mongo Coonected DB Host: ${connectionDb.connection.host}`)
    server.listen(app.get("port"),()=>{
        console.log("listening to port 8000")
    }); 
}

start();