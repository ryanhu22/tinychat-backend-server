import React from "react";
import Toolbar from "../components/doc/Toolbar";
import DocumentEditor from "../components/doc/DocumentEditor";

const Home = () => {
  return (
    <div className="flex flex-col h-screen">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <DocumentEditor />
      </div>
    </div>
  );
};

export default Home;
