import { useState, useRef } from "react";

const AudioRecorder = () => {
  const [audioUrl, setAudioUrl] = useState("");
  const [transcription, setTranscription] = useState("");
  const audioRef = useRef();
  const [recording, setRecording] = useState(false);

  let mediaRecorder;
  let audioChunks = [];

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    setRecording(true);

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioUrl(audioUrl);

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setTranscription(data.transcription);
    };
  };

  const stopRecording = () => {
    mediaRecorder.stop();
    setRecording(false);
    audioChunks = [];
  };

  return (
    <div>
      <button onClick={recording ? stopRecording : startRecording}>
        {recording ? "Stop Recording" : "Start Recording"}
      </button>
      {audioUrl && (
        <div>
          <audio ref={audioRef} src={audioUrl} controls />
          <p>Transcription: {transcription}</p>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
