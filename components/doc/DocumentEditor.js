"use client";
import React, { useState } from "react";

const DocumentEditor = () => {
  const [text, setText] = useState("Start typing your document here...");

  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="border p-4 bg-white min-h-full">
        <textarea
          className="text-gray-600 w-full h-full"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </div>
  );
};

export default DocumentEditor;
