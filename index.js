// To run backend, run node index.js

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const upload = multer({ dest: "uploads/" });
const OpenAI = require("openai");
const FormData = require("form-data");

const axios = require("axios");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");
const bodyParser = require("body-parser");

const base64 = require("base64-js");
var admin = require("firebase-admin");

// Firebase setup
var serviceAccount = require("./firebase-private-key.json");

// Websocket
const wss = new WebSocket.Server({ server: server });
let internalMemory = {};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Functions
const speechToText = async (file) => {
  console.log(`Received file: ${file.path}`);

  const formData = new FormData();
  formData.append("model", "whisper-1");
  formData.append("file", fs.createReadStream(file.path), {
    filename: file.originalname,
  });
  const resp = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  console.log(resp.data);
  return resp.data.text;
};

const getUnreadConversationsByEmail = async (userEmail) => {
  // Query conversations by user_email
  const querySnapshot = await db
    .collection("conversations")
    .where("sender_email", "==", userEmail)
    .where("is_unread", "==", true)
    .orderBy("last_message_timestamp")
    .get();

  const conversations = querySnapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .reverse();

  if (conversations.length === 0) {
    return [];
  }

  // Get messages for each unread conversation
  // Map over the conversations, calling getUnreadMessagesByConversationId for each one
  const messagesPromises = conversations.map((conversation) =>
    getUnreadMessagesByConversationId(conversation.id)
  );

  // Use Promise.all to wait for all the promises to resolve
  const messagesArrays = await Promise.all(messagesPromises);

  // Create a new array of objects, each containing the conversation id and its corresponding messages
  const conversationsWithMessages = conversations.map(
    (conversation, index) => ({
      id: conversation.id,
      messages: messagesArrays[index],
    })
  );

  // Return the result as a JSON string
  return conversationsWithMessages;

  // const messages = await getUnreadMessagesByConversationId(conversations[0].id);
  // return messages;
};

const getUnreadMessagesByConversationId = async (conversationId) => {
  try {
    // Query messages by conversation_id and order them by createdAt timestamp in ascending order
    // so that we process older messages first
    const querySnapshot = await db
      .collection("messages")
      .where("conversation_id", "==", conversationId)
      .orderBy("createdAt") // Assuming 'createdAt' is your timestamp field
      .get();

    const messages = [];
    let readCheckpointFound = false;

    // Start from the newest message and move towards the oldest
    querySnapshot.docs.reverse().forEach((doc) => {
      // If a message with read_checkpoint == true is found, set the flag and stop processing further
      if (doc.data().read_checkpoint === true) {
        readCheckpointFound = true;
        return;
      }

      // If the flag is not set, push the message to the array
      if (!readCheckpointFound) {
        messages.push({
          id: doc.id,
          ...doc.data(),
        });
      }
    });

    // If no read checkpoint was found, return all messages
    // if (!readCheckpointFound) {
    //   messages.push(
    //     ...querySnapshot.docs.map((doc) => ({
    //       id: doc.id,
    //       ...doc.data(),
    //     }))
    //   );
    // }

    // Since we originally ordered messages from newest to oldest, reverse them before sending
    return messages.reverse();
  } catch (error) {
    console.error("Error getting messages:", error);
    return null;
  }
};

const markConversationAsRead = async (conversationId, lastMessageId) => {
  try {
    await db.collection("conversations").doc(conversationId).update({
      is_unread: false,
    });

    // Read checkpoint
    await db.collection("messages").doc(lastMessageId).update({
      read_checkpoint: true,
    });
  } catch (error) {
    console.error("Error marking conversation as read:", error);
  }
};

const getUser = async (user_email) => {
  const querySnapshot = await db
    .collection("users")
    .where("email", "==", user_email)
    .get();
  return querySnapshot.docs[0].data();
};

const sendMessage = async (
  conversationId,
  senderEmail,
  receiverEmail,
  text
) => {
  try {
    // Get users
    const sender = await getUser(senderEmail);
    const receiver = await getUser(receiverEmail);

    // Add message
    await db.collection("messages").add({
      conversation_id: conversationId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      message_id: "_id", // some hash
      read_checkpoint: true,
      text: text,
      user: { _id: senderEmail, avatar: sender.avatar },
    });

    // Update sender's conversations db
    await db.collection("conversations").doc(conversationId).update({
      is_unread: false,
      last_message_timestamp: admin.firestore.FieldValue.serverTimestamp(),
      last_message: text,
    });

    // ======= Receiver stuff =========

    // Add message to receiver db
    const querySnapshot = await db
      .collection("conversations")
      .where("sender_email", "==", receiverEmail)
      .where("receiver_email", "==", senderEmail)
      .get();

    const receiverConversationId = querySnapshot.docs[0].id;
    // Add message to receiver's messages db
    await db.collection("messages").add({
      conversation_id: receiverConversationId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      message_id: "_id2",
      read_checkpoint: false,
      text: text,
      user: { _id: senderEmail, avatar: receiver.avatar },
    });

    // Update receiver's conversations db
    await db.collection("conversations").doc(receiverConversationId).update({
      is_unread: true,
      last_message_timestamp: admin.firestore.FieldValue.serverTimestamp(),
      last_message: text,
    });

    return "Done";
  } catch (error) {
    console.error("Error sending message:", error);
  }
  // // Add message to my own Firestore DB
  // await addMessageToFirestore(conversationId, _id, text, user, true);

  // if (receiverEmail !== myData.email) {
  //   const receiverConversationId = await findReceiverConversationId(
  //     receiverEmail,
  //     myData.email
  //   );
};

app.post("/upload-speech-to-text", upload.single("voice"), async (req, res) => {
  const file = req.file;
  const text = await speechToText(file);
  res.send({ text: text });
});

app.get("/get-unread-conversations/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;
    const messages = await getUnreadConversationsByEmail(userEmail);
    res.json(messages);
  } catch {}
});

app.get("/", (req, res) => {
  getUser("ryan@gmail.com").then((user) => {
    res.send(user);
  });
});

// Websocket
wss.on("connection", function connection(ws) {
  console.log("A new client connected!");

  ws.on("message", function incoming(message) {
    // Parse the JSON data
    let jsonData = {};
    try {
      jsonData = JSON.parse(message);
      console.log("received: %s", jsonData);
    } catch {
      console.log("[Server] Error: Invalid JSON format");
      return;
    }

    if (!jsonData.message) {
      console.log("[Server] Error: No message found in the request");
      return;
    }

    let message_body = jsonData.message;
    let sender_email = jsonData.sender_email;

    // Special case: We're responding to a conversation, so use a different ChatGPT Query:
    if (
      internalMemory[sender_email] &&
      internalMemory[sender_email].pending_response === true
    ) {
      axios
        .post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: `You are helping me to compose a text message to somebody. Only respond with what I should write in a text message. Take my words as literal, but also autocorrect some grammar or typos.`,
              },
              {
                role: "user",
                content: `My message is this: ${message_body}`,
              },
            ],
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          const responseMessage = response.data.choices[0].message.content;
          sendMessage(
            internalMemory[sender_email].conversation_id,
            sender_email,
            internalMemory[sender_email].receiver_email,
            responseMessage
          ).then((res) => {
            internalMemory[sender_email].pending_response = false;
            ws.send("Done! Is there anything else you'd like to do?");
          });
          // console.log(`Response: ${responseMessage}`);
          // ws.send(responseMessage);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      axios
        .post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content:
                  "Pretend you are a natural language processor. You can ONLY respond with 0 or 1 or 2. You can only respond with 0 if the user is asking you to read an unread message, otherwise, respond 2. But use your judgement. For example, if the user asks you to read one of their unread messages, you can respond 0. If the user responds with yes or yes, I'd like to respond, or anything along those lines, then respond with 1.",
              },
              {
                role: "user",
                content: `${message_body}`,
              },
            ],
            // prompt: message_body,
            max_tokens: 1,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          const responseMessage = response.data.choices[0].message.content;
          console.log(`Response: ${responseMessage}`);
          // Case 1: Read me an unread message
          if (responseMessage === "0") {
            let returnResponse = "";
            getUnreadConversationsByEmail(sender_email).then(
              (conversations) => {
                returnResponse += `You have ${conversations.length} unread conversations...`;
                if (conversations.length === 0) {
                  ws.send(`You have no more unread messages.`);
                  return;
                }
                console.log(conversations[0]);
                const firstConversation = conversations[0];
                markConversationAsRead(
                  firstConversation.id,
                  conversations[0].messages[
                    conversations[0].messages.length - 1
                  ].id
                );
                returnResponse += `Your first conversation is with ${firstConversation.messages[0].user._id}. They said: `;
                firstConversation.messages.forEach((message) => {
                  returnResponse += `${message.text}`;
                });
                internalMemory[sender_email] = {
                  sender_email: sender_email,
                  receiver_email: firstConversation.messages[0].user._id,
                  conversation_id: firstConversation.id,
                  pending_response: false,
                };
                returnResponse += `...Would you like to respond?`;
                ws.send(returnResponse);
              }
            );
          } else if (responseMessage === "1") {
            internalMemory[sender_email].pending_response = true;
            ws.send("What would you like to say?");
          } else {
            ws.send(`I'm sorry, I can't do that. Please try again.`);
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  });
});

// server was 'app'
server.listen(8000, () => {
  console.log("Server started on port 8000");
});
