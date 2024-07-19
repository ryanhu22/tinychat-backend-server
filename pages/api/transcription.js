// import multer from "multer";
// import axios from "axios";
// import FormData from "form-data";
// import fs from "fs";

// const upload = multer();

// export default async function handler(req, res) {
//   if (req.method !== "POST") {
//     res.status(405).json({ error: "Method not allowed" });
//     return;
//   }

//   upload.single("file")(req, res, async (err) => {
//     if (err instanceof multer.MulterError) {
//       // A Multer error occurred when uploading.
//       res.status(501).json({ error: err.message });
//     } else if (err) {
//       // An unknown error occurred when uploading.
//       res.status(502).json({ error: err.message });
//     }

//     console.log("POST WORKED");
//     try {
//       console.log(req.file);
//       const { buffer, originalname } = req.file;

//       const formData = new FormData();
//       formData.append("model", "whisper-1");
//       formData.append("file", fs.createReadStream(buffer.path), {
//         filename: originalname,
//       });
//       const response = await axios.post(
//         "https://api.openai.com/v1/audio/transcriptions",
//         formData,
//         {
//           headers: {
//             "Content-Type": "multipart/form-data",
//             Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//           },
//         }
//       );
//       console.log(response.data);
//       res.status(200).json({ transcription: response.data.text });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });
// }

// Import necessary libraries
import { exec } from "child_process";
import fs from "fs";
import OpenAI from "openai";

// Promisify the exec function from child_process
const util = require("util");
const execAsync = util.promisify(exec);

const openai = new OpenAI();

// This function handles POST requests to the /api/speechToText route
export default async function handler(req, res) {
  const data = await req.body;

  // Extract the audio data from the request body
  const base64Audio = data.audio;
  // Convert the Base64 audio data back to a Buffer
  const audio = Buffer.from(base64Audio, "base64");
  try {
    console.log("Converting audio to text?");
    // Convert the audio data to text
    const text = await convertAudioToText(audio);
    // Return the transcribed text in the response
    res.status(200).json({ result: text });
  } catch (error) {
    // Handle any errors that occur during the request
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(500).json({ error: error.response.data });
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      res.status(500).json({ error: "An error occurred during your request." });
    }
  }
}
// This function converts audio data to text using the OpenAI API
async function convertAudioToText(audioData) {
  // Convert the audio data to MP3 format
  const mp3AudioData = await convertAudioToMp3(audioData);
  // Write the MP3 audio data to a file
  const outputPath = "/tmp/output.mp3";
  fs.writeFileSync(outputPath, mp3AudioData);
  // Transcribe the audio
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(outputPath),
    model: "whisper-1",
  });

  // Delete the temporary file
  fs.unlinkSync(outputPath);
  // The API response contains the transcribed text
  console.log("HELLO");
  console.log(response.text);
  const transcribedText = response.text;
  return transcribedText;
}
// This function converts audio data to MP3 format using ffmpeg
async function convertAudioToMp3(audioData) {
  // Write the audio data to a file
  const inputPath = "/tmp/input.webm";
  fs.writeFileSync(inputPath, audioData);
  // Convert the audio to MP3 using ffmpeg
  const outputPath = "/tmp/output.mp3";
  await execAsync(`ffmpeg -i ${inputPath} ${outputPath}`);
  // Read the converted audio data
  const mp3AudioData = fs.readFileSync(outputPath);
  // Delete the temporary files
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);
  return mp3AudioData;
}
