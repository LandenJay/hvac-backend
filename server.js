// server.js
require("dotenv").config();
const express = require("express");
const { createEvent } = require("ics");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Load environment variables
const EMAIL_USER = process.env.EMAIL_USER; // Gmail sender account
const EMAIL_PASS = process.env.EMAIL_PASS; // Gmail app password
const RECEIVE_EMAIL = process.env.RECEIVE_EMAIL || EMAIL_USER; // Business inbox

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn("⚠️ WARNING: EMAIL_USER and EMAIL_PASS environment variables are not set.");
}

// Helper to parse "HH:MM"
function parseTimeHHMM(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return { hh, mm };
}

app.post("/book", async (req, res) => {
  try {
    const { date, time, name, email } = req.body;

    if (!date || !time || !name || !email) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

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
      description: `Appointment booked for ${name} via the website.`,
      status: "CONFIRMED",
      organizer: { name: "J & L Climate Co.", email: EMAIL_USER },
      attendees: [
        { name: name, email: email, rsvp: true },
        { name: "J & L Climate Co.", email: RECEIVE_EMAIL, rsvp: false }
      ]
    };

    createEvent(event, async (error, value) => {
      if (error) {
        console.error("ICS error:", error);
        return res.status(500).json({ success: false, message: "Failed to create calendar invite" });
      }

      let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS
        }
      });

      const mailOptions = {
        from: `"J & L Climate Co." <${EMAIL_USER}>`,
        to: [email, RECEIVE_EMAIL], // send to client + your chosen inbox
        subject: "Your Appointment is Confirmed",
        text: `Hi ${name},\n\nYour appointment with J & L Climate Co. is scheduled for ${date} at ${time}.\n\nThank you!\n`,
        icalEvent: {
          filename: "invite.ics",
          method: "REQUEST",
          content: value
        }
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully to:", [email, RECEIVE_EMAIL]);
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

app.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));

