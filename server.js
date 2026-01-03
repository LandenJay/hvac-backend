// server.js
require("dotenv").config();
const express = require("express");
const { createEvent } = require("ics");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();

// ✅ CORS fix – allow requests from anywhere for now (later, replace "*" with your domain)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(bodyParser.json());
app.get("/", (req, res) => {
  res.status(200).send("✅ HVAC backend is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// ✅ Environment variables (set these in Render dashboard)
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn("⚠️ WARNING: EMAIL_USER and EMAIL_PASS environment variables are not set.");
}

// Simple helper to parse "HH:MM" into integers
function parseTimeHHMM(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return { hh, mm };
}

app.post("/book", async (req, res) => {
  try {
    const { date, time, name, email, phone, address } = req.body;

    if (!date || !time || !name || !email || !phone || !address) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Parse date and time
    const [yearStr, monthStr, dayStr] = date.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    const { hh, mm } = parseTimeHHMM(time);
    const startArray = [year, month, day, hh, mm];
    const duration = { hours: 1, minutes: 0 };

    const event = {
      start: startArray,
      duration,
      title: `J & L Climate Co. Appointment - ${name}`,
      description: `Appointment for ${name}, Phone: ${phone}, Address: ${address}`,
      status: "CONFIRMED",
      organizer: { name: "J & L Climate Co.", email: EMAIL_USER },
      attendees: [
        { name: name, email: email, rsvp: true },
        { name: "J & L Climate Co.", email: EMAIL_USER, rsvp: false }
      ]
    };

    createEvent(event, async (error, value) => {
      if (error) {
        console.error("ICS error:", error);
        return res.status(500).json({ success: false, message: "Failed to create calendar invite" });
      }

      let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
      });

      const mailOptions = {
        from: `"J & L Climate Co." <${EMAIL_USER}>`,
        to: [email, EMAIL_USER],
        subject: "Your Appointment is Confirmed",
        text: `Hi ${name},\n\nYour appointment with J & L Climate Co. is confirmed:\n\nDate: ${date}\nTime: ${time}\nPhone: ${phone}\nAddress: ${address}\n\nThank you!`,
        icalEvent: { filename: "invite.ics", method: "REQUEST", content: value }
      };

      try {
        await transporter.sendMail(mailOptions);
        return res.json({ success: true, message: "Booked & invite emailed" });
      } catch (mailErr) {
        console.error("Mail error:", mailErr);
        return res.status(500).json({ success: false, message: "Booking created but failed to send email" });
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Render fix: use process.env.PORT, fallback to 3000 for local dev
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
