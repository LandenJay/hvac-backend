// server.js - J&L Climate Co. service request backend

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RECEIVE_EMAIL = process.env.RECEIVE_EMAIL || EMAIL_USER;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn("⚠️ WARNING: EMAIL_USER and EMAIL_PASS environment variables are not set.");
}

app.get("/", (req, res) => {
  res.status(200).send("✅ J&L Climate Co. backend is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/request", async (req, res) => {
  try {
    const { name, email, phone, address, details } = req.body;

    if (!name || !email || !phone || !address || !details) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });

    const customerMail = {
      from: EMAIL_USER,
      to: email,
      subject: "✅ Service Request Received - J&L Climate Co.",
      text: `Hi ${name},

We received your service request and will contact you shortly to schedule.

Your request:

Phone: ${phone}
Address: ${address}

Service Details:
${details}

Thanks,
J&L Climate Co.`
    };

    const businessMail = {
      from: EMAIL_USER,
      to: RECEIVE_EMAIL,
      subject: "📌 New HVAC Service Request - J&L Climate Co.",
      text: `New HVAC service request:

Name: ${name}
Email: ${email}
Phone: ${phone}
Address: ${address}

Service Details:
${details}`
    };

    await transporter.sendMail(customerMail);
    await transporter.sendMail(businessMail);

    res.json({
      success: true,
      message: "Request sent successfully"
    });

  } catch (err) {
    console.error("Request error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ J&L Climate Co. backend running on port ${PORT}`);
});