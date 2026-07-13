// LocalLink — auth.js
// Handles phone OTP + Google login, creates/reads the role-based profile
// in Firestore, and redirects to the right dashboard.

import { auth, db } from "/js/firebase-config.js";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const role = params.get("role") === "worker" ? "worker" : "customer";

const roleTag = document.getElementById("roleTag");
if (roleTag) roleTag.textContent = role === "worker" ? "Worker login" : "Customer login";

let confirmationResult = null;
let recaptchaVerifier = null;

function ensureRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;
  recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible",
  });
  return recaptchaVerifier;
}

window.handleSendOtp = async function () {
  const phoneInput = document.getElementById("phoneInput");
  const digits = phoneInput.value.replace(/\D/g, "");

  if (digits.length !== 10) {
    phoneInput.focus();
    return;
  }

  const btn = document.getElementById("sendOtpBtn");
  btn.textContent = "Sending…";
  btn.disabled = true;

  try {
    const verifier = ensureRecaptcha();
    confirmationResult = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
    document.getElementById("phoneDisplay").textContent = digits;
    showOtpStep();
  } catch (err) {
    console.error(err);
    btn.textContent = "Send OTP";
    btn.disabled = false;
    alert("Couldn't send OTP. Check the number and try again.");
  }
};

window.handleVerifyOtp = async function () {
  const boxes = Array.from(document.querySelectorAll(".otp-box"));
  const code = boxes.map((b) => b.value).join("");
  const errorEl = document.getElementById("otpError");

  if (code.length !== 6 || !confirmationResult) {
    errorEl.textContent = "Enter the full 6-digit code.";
    errorEl.style.display = "block";
    return;
  }

  const btn = document.getElementById("verifyOtpBtn");
  btn.textContent = "Verifying…";
  btn.disabled = true;

  try {
    const result = await confirmationResult.confirm(code);
    await ensureProfile(result.user, "phone");
    redirectAfterLogin();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Incorrect code. Please try again.";
    errorEl.style.display = "block";
    btn.textContent = "Verify & Continue";
    btn.disabled = false;
  }
};

window.handleGoogleLogin = async function () {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await ensureProfile(result.user, "google");
    redirectAfterLogin();
  } catch (err) {
    console.error(err);
    alert("Google sign-in failed. Please try again.");
  }
};

async function ensureProfile(user, method) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      role,
      name: user.displayName || "",
      phone: user.phoneNumber || "",
      email: user.email || "",
      photoUrl: user.photoURL || "",
      loginMethod: method,
      createdAt: serverTimestamp(),
      // worker-only fields default empty; filled during worker onboarding
      ...(role === "worker" ? { verificationStatus: "pending", isOnline: false } : {}),
    });
  }
}

function redirectAfterLogin() {
  window.location.href = role === "worker" ? "/worker/dashboard.html" : "/index.html";
}

window.showPhoneStep = function () {
  document.getElementById("otpStep").style.display = "none";
  document.getElementById("phoneStep").style.display = "block";
};

function showOtpStep() {
  document.getElementById("phoneStep").style.display = "none";
  document.getElementById("otpStep").style.display = "block";
  document.querySelector(".otp-box").focus();
}

// Auto-advance between OTP boxes
document.addEventListener("input", (e) => {
  if (!e.target.classList.contains("otp-box")) return;
  e.target.value = e.target.value.replace(/\D/g, "");
  if (e.target.value && e.target.nextElementSibling) {
    e.target.nextElementSibling.focus();
  }
});
document.addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("otp-box")) return;
  if (e.key === "Backspace" && !e.target.value && e.target.previousElementSibling) {
    e.target.previousElementSibling.focus();
  }
});
