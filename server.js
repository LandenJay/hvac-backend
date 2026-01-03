// server.js
require("dotenv").config();
const express = require("express");
const { createEvent } = require("ics");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const booked = {};
const app = express();

app.use(cors({
  origin: "*", // later: replace with your domain(s)
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(bodyParser.json());

// ===== Email env vars =====
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RECEIVE_EMAIL = process.env.RECEIVE_EMAIL || EMAIL_USER;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn("⚠️ WARNING: EMAIL_USER and EMAIL_PASS environment variables are not set.");
}



// ===== Time slots =====
const slots = {
  weekday: [
    { label: "9:00 AM", value: "09:00" },
    { label: "11:00 AM", value: "11:00" },
    { label: "1:00 PM", value: "13:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "5:00 PM", value: "17:00" },
  ],
  saturday: [
    { label: "9:00 AM", value: "09:00" },
    { label: "11:00 AM", value: "11:00" },
    { label: "1:00 PM", value: "13:00" },
  ],
  sunday: [],
};

function parseTimeHHMM(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return { hh, mm };
}

function getSlotListForDate(dateStr) {
  // dateStr: YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun 6=Sat
  if (dow === 0) return slots.sunday;
  if (dow === 6) return slots.saturday;
  return slots.weekday;
}

// ===== Basic routes =====
app.get("/", (req, res) => res.status(200).send("✅ HVAC backend is running"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

// ===== Availability endpoint =====
app.get("/availability", (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ success: false, message: "Missing date" });
  }

  const possible = getSlotListForDate(date);
  const bookedForDate = booked[date] || [];

  const available = possible.filter(
    slot => !bookedForDate.includes(slot.value)
  );

  res.json({
    success: true,
    date,
    available,
  });
});


  // in-memory bookings (temporary)
const bookedForDate = booked[date] || [];

const available = possible.filter(
  slot => !bookedForDate.includes(slot.value)
);

res.json({
  success: true,
  date,
  available, // [{ label, value }]
});


// Temporary in-memory store (later replace with DB)
const bookedAppointments = {};

// Availability endpoint
app.get("/availability", (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ success: false, message: "date is required" });
  }

  return res.json({
    success: true,
    date,
    bookedTimes: bookedAppointments[date] || []
  });
});
app.get("/availability", (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      message: "Missing date parameter"
    });
  }

  // For now, return all available slots
  // (later you can block out booked times)
  const slots = [
    "09:00",
    "11:00",
    "13:00",
    "15:00",
    "17:00"
  ];

  res.json({
    success: true,
    date,
    slots
  });
});

// ===== Booking endpoint =====
app.post("/book", async (req, res) => {
  try {
    const { date, time, name, email, phone, address } = req.body;
// Save booked time in memory
if (!bookedAppointments[date]) bookedAppointments[date] = [];
bookedAppointments[date].push(time);

    if (!date || !time || !name || !email || !phone || !address) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // First: attempt to insert booking (this enforces no double-booking)
    db.run(
      `INSERT INTO bookings (date, time, name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)`,
      [date, time, name, email, phone, address],
      async function (err) {
        if (err) {
          // Unique constraint hit = already booked
          if (String(err.message || "").includes("UNIQUE")) {
            return res.status(409).json({ success: false, message: "That time slot was just booked. Please pick another." });
          }
          console.error("DB insert error:", err);
          return res.status(500).json({ success: false, message: "DB error" });
        }

        // Create ICS
        const [yearStr, monthStr, dayStr] = date.split("-");
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);
        const { hh, mm } = parseTimeHHMM(time);

        const event = {
          start: [year, month, day, hh, mm],
          duration: { hours: 1, minutes: 0 },
          title: `J & L Climate Co. Appointment - ${name}`,
          description: `Appointment booked via website.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nDate: ${date}\nTime: ${time}`,
          status: "CONFIRMED",
          organizer: { name: "J & L Climate Co.", email: EMAIL_USER },
          attendees: [
            { name, email, rsvp: true },
            { name: "J & L Climate Co.", email: RECEIVE_EMAIL, rsvp: false },
          ],
        };

        createEvent(event, async (icsErr, icsValue) => {
          if (icsErr) {
            console.error("ICS error:", icsErr);
            // Booking exists, but invite failed
            return res.status(500).json({ success: false, message: "Booked, but failed to create calendar invite." });
          }

          // Send email
          try {
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            });

            await transporter.sendMail({
              from: `"J & L Climate Co." <${EMAIL_USER}>`,
              to: [email, RECEIVE_EMAIL],
              subject: "Your Appointment is Confirmed",
              text:
                `Hi ${name},\n\n` +
                `Your appointment is scheduled for ${date} at ${time}.\n\n` +
                `Phone: ${phone}\nAddress: ${address}\n\n` +
                `Thank you!\nJ & L Climate Co.`,
              icalEvent: {
                filename: "invite.ics",
                method: "REQUEST",
                content: icsValue,
              },
            });

            return res.json({ success: true, message: "Booked & invite emailed" });
          } catch (mailErr) {
            console.error("Mail error:", mailErr);
            return res.status(500).json({ success: false, message: "Booked, but failed to send email." });
          }
        });
      }
    );
  } catch (e) {
    console.error("Server error:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Render PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
app.use(cors({
  origin: [
    "https://jnlclimatecompany.com",
    "https://www.jnlclimatecompany.com"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
