"use client";

import React, { useState, useEffect, useRef } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";

const Toolbar = () => {
  return (
    <header className="flex items-center justify-between px-10 py-3  border-b">
      {/* Note Title */}
      <div className="flex items-center space-x-2">
        <PencilSquareIcon className="h-8 w-8 text-gray-600" />
        <div className="flex flex-col">
          <RenameableTitle />
          <p className="text-xs text-gray-600 px-1">
            in booklet <span className="underline">Misc</span>
          </p>
        </div>
      </div>

      {/* Stopwatch widget */}
      <AudioRecorder />
    </header>
  );
};

const RenameableTitle = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("Untitled document");
  const [hovering, setHovering] = useState(false);
  const inputRef = useRef(null);

  const handleTitleClick = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
      }
    }, 0);
  };

  const handleTitleChange = (e) => {
    setTitle(e.target.value);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleHover = () => {
    setHovering(true);
  };

  const handleLeave = () => {
    setHovering(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="border border-gray-300 p-1 rounded outline-none"
        />
      ) : (
        <div
          className="relative flex items-center"
          onMouseEnter={handleHover}
          onMouseLeave={handleLeave}
        >
          <span
            onClick={handleTitleClick}
            className="cursor-pointer border border-gray-300 rounded px-2 py-1"
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
};

const AudioRecorder = () => {
  // Stopwatch logic
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  // Define state variables for the result, recording status, and media recorder
  const [result, setResult] = useState();
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  // This array will hold the audio data
  let chunks = [];

  useEffect(() => {
    let intervalId;
    if (isRunning) {
      // setting time from 0 to 1 every second using javascript setInterval method
      intervalId = setInterval(() => setTime(time + 1), 1000);
    }
    return () => clearInterval(intervalId);
  }, [isRunning, time]);

  // Hours calculation
  const hours = Math.floor(time / 3600);

  // Minutes calculation
  const minutes = Math.floor((time % 3600) / 600);

  // Seconds calculation
  const seconds = Math.floor(time % 60);

  // This useEffect hook sets up the media recorder when the component mounts
  useEffect(() => {
    if (typeof window !== "undefined") {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const newMediaRecorder = new MediaRecorder(stream);
          newMediaRecorder.onstart = () => {
            chunks = [];
          };
          newMediaRecorder.ondataavailable = (e) => {
            chunks.push(e.data);
          };
          newMediaRecorder.onstop = async () => {
            const audioBlob = new Blob(chunks, { type: "audio/webm" });
            try {
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = async function () {
                const base64Audio = reader.result.split(",")[1]; // Remove the data URL prefix
                console.log(audioBlob);
                const response = await fetch("/api/transcription", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ audio: base64Audio }),
                });
                const data = await response.json();
                if (response.status !== 200) {
                  throw (
                    data.error ||
                    new Error(`Request failed with status ${response.status}`)
                  );
                }
                console.log(data);
                setResult(data.result);
              };
            } catch (error) {
              console.error(error);
              alert(error.message);
            }
          };
          setMediaRecorder(newMediaRecorder);
        })
        .catch((err) => console.error("Error accessing microphone:", err));
    }
  }, []);

  const pressStopwatch = () => {
    setIsRunning(!isRunning);
    // Disable start/stop button for 2 seconds
    setIsDisabled(true);
    setTimeout(() => {
      setIsDisabled(false);
    }, 1000);
  };

  // Function to start recording
  const startRecording = () => {
    if (isDisabled) return;
    if (mediaRecorder) {
      mediaRecorder.start();
      setRecording(true);
    }

    pressStopwatch();
  };
  // Function to stop recording
  const stopRecording = () => {
    if (isDisabled) return;
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }

    pressStopwatch();
  };

  return (
    <div className="flex items-center justify-center">
      <p className="font-mono">
        {hours}:{minutes.toString().padStart(2, "0")}:
        {seconds.toString().padStart(2, "0")}
      </p>
      <div className="flex justify-center">
        <button
          className={`m-4 p-1 px-3 text-white rounded ${
            isRunning ? "bg-red-500" : "bg-green-500"
          }`}
          onClick={recording ? stopRecording : startRecording}
        >
          {isRunning ? "Stop Recording" : "Start Recording"}
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
