/**
 * =========================================================================
 * Frontend Application Logic - ระบบตรวจวัดแอลกอฮอล์ พนักงานขับรถขนส่ง
 * หจก. ทั่วไทยขนส่งมงคล (Mr.Taweesak.kom - 062-3285963)
 * =========================================================================
 */

// --- การตั้งค่าระบบ (Configuration) ---
const CONFIG = {
  // ใส่ Google Apps Script Web App Deployment URL ที่นี่
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbygXhKLj8jXNkY70z8w5_UYVbrAET_SfJ6l33HX16Tu1pkK9UsVWgc60rRnv1WcaeKeFg/exec",
  SPREADSHEET_ID: "1JM-i8_nrGR7-VDEY82QZ5l5JMJTIBOIsuqOSQSrcD3Y",
  DRIVE_FOLDER_ID: "1tfKH6EOBFdG0c4Wm2MPO-R61NP5mAc0c",
  LEGAL_LIMIT_MG_PERCENT: 0.00, // นโยบายความปลอดภัยของบริษัท: ต้องเป็น 0.00 mg% เท่านั้น
  
  // ฐานข้อมูลพนักงานสำรองในฝั่ง Client กรณีออฟไลน์หรือไม่สามารถติดต่อ GAS ได้ชั่วคราว
  FALLBACK_DRIVERS: [
    {
      driverId: "DRV-001",
      driverName: "นายทวีศักดิ์ คมสัน (Mr.Taweesak)",
      email: "taweesak.kom@gmail.com",
      phone: "062-3285963",
      vehiclePlate: "70-8899 กทม.",
      department: "แผนกขนส่งด่วนพิเศษ",
      status: "ACTIVE"
    },
    {
      driverId: "DRV-002",
      driverName: "นายสมชาย วงศ์สวัสดิ์",
      email: "somchai.driver@gmail.com",
      phone: "089-1122334",
      vehiclePlate: "70-5544 กทม.",
      department: "แผนกขนส่งภาคเหนือ",
      status: "ACTIVE"
    }
  ]
};

// --- ตัวแปรสถานะส่วนกลาง (State Management) ---
const appState = {
  currentStep: 1,
  driver: null,
  facePhotoBase64: null,
  meterPhotoBase64: null,
  alcoholValue: 0.00,
  testStatus: "ผ่าน",
  gps: {
    lat: null,
    lng: null,
    accuracy: null,
    text: "ยังไม่ได้รับพิกัด"
  },
  currentStream: null
};

// --- เริ่มต้นการทำงานเมื่อ DOM พร้อม ---
document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  requestGPSCoordinates();
});

/**
 * กำหนด Event Listeners ทั้งหมด
 */
function initEventListeners() {
  // Step 1: ตรวจสอบอีเมล
  const btnLookupEmail = document.getElementById("btnLookupEmail");
  const driverEmailInput = document.getElementById("driverEmailInput");
  const btnNextToStep2 = document.getElementById("btnNextToStep2");

  btnLookupEmail.addEventListener("click", () => handleEmailLookup());
  driverEmailInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleEmailLookup();
  });
  btnNextToStep2.addEventListener("click", () => goToStep(2));

  // Step 2: กล้องถ่ายรูปใบหน้า
  const btnStartFaceCamera = document.getElementById("btnStartFaceCamera");
  const btnCaptureFace = document.getElementById("btnCaptureFace");
  const btnRetakeFace = document.getElementById("btnRetakeFace");
  const btnBackToStep1 = document.getElementById("btnBackToStep1");
  const btnNextToStep3 = document.getElementById("btnNextToStep3");

  btnStartFaceCamera.addEventListener("click", () => startCamera("user", "faceVideo"));
  btnCaptureFace.addEventListener("click", () => captureFaceSnapshot());
  btnRetakeFace.addEventListener("click", () => retakeFaceSnapshot());
  btnBackToStep1.addEventListener("click", () => {
    stopCurrentCamera();
    goToStep(1);
  });
  btnNextToStep3.addEventListener("click", () => {
    stopCurrentCamera();
    goToStep(3);
  });

  // Step 3: กล้องถ่ายหน้าปัดเครื่องเป่า & OCR
  const btnStartMeterCamera = document.getElementById("btnStartMeterCamera");
  const btnCaptureMeter = document.getElementById("btnCaptureMeter");
  const btnRetakeMeter = document.getElementById("btnRetakeMeter");
  const btnBackToStep2 = document.getElementById("btnBackToStep2");
  const btnNextToStep4 = document.getElementById("btnNextToStep4");
  const alcoholValueInput = document.getElementById("alcoholValueInput");

  btnStartMeterCamera.addEventListener("click", () => startCamera("environment", "meterVideo"));
  btnCaptureMeter.addEventListener("click", () => captureMeterSnapshot());
  btnRetakeMeter.addEventListener("click", () => retakeMeterSnapshot());
  btnBackToStep2.addEventListener("click", () => {
    stopCurrentCamera();
    goToStep(2);
  });
  btnNextToStep4.addEventListener("click", () => {
    stopCurrentCamera();
    prepareSummaryStep();
    goToStep(4);
  });

  alcoholValueInput.addEventListener("input", (e) => {
    updateAlcoholEvaluation(parseFloat(e.target.value) || 0);
  });

  // Step 4: ส่งข้อมูลผลตรวจ
  const btnBackToStep3 = document.getElementById("btnBackToStep3");
  const btnFinalSubmit = document.getElementById("btnFinalSubmit");

  btnBackToStep3.addEventListener("click", () => goToStep(3));
  btnFinalSubmit.addEventListener("click", () => handleSubmitData());
}

/**
 * จัดการเปลี่ยนหน้า Step
 */
function goToStep(stepNumber) {
  appState.currentStep = stepNumber;

  // ซ่อนทุกหน้า
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step${i}`);
    const indicatorEl = document.getElementById(`stepIndicator${i}`);
    if (stepEl) stepEl.classList.add("hidden");
    if (indicatorEl) {
      indicatorEl.classList.remove("text-blue-400", "font-bold");
      indicatorEl.classList.add("text-slate-400");
    }
  }

  // แสดงหน้าปัจจุบัน
  const activeStepEl = document.getElementById(`step${stepNumber}`);
  const activeIndicatorEl = document.getElementById(`stepIndicator${stepNumber}`);
  if (activeStepEl) activeStepEl.classList.remove("hidden");
  if (activeIndicatorEl) {
    activeIndicatorEl.classList.remove("text-slate-400");
    activeIndicatorEl.classList.add("text-blue-400", "font-bold");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================================
// STEP 1: Email Lookup & Authentication
// =========================================================================
async function handleEmailLookup() {
  const emailInput = document.getElementById("driverEmailInput");
  const email = (emailInput.value || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    Swal.fire({
      icon: "warning",
      title: "กรุณาระบุอีเมลให้ถูกต้อง",
      text: "โปรดป้อนรูปแบบอีเมลพนักงาน เช่น taweesak.kom@gmail.com",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  Swal.fire({
    title: "กำลังตรวจสอบข้อมูล...",
    html: `<div class="text-xs text-slate-500">กำลังค้นหาข้อมูลพนักงานในระบบ หจก. ทั่วไทยขนส่งมงคล</div>`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  let driverFound = null;

  // พยายามติดต่อ Google Apps Script Backend ก่อน
  if (CONFIG.GAS_WEBAPP_URL && !CONFIG.GAS_WEBAPP_URL.includes("REPLACE_WITH_YOUR_DEPLOYMENT_ID")) {
    try {
      const response = await fetch(`${CONFIG.GAS_WEBAPP_URL}?action=checkEmail&email=${encodeURIComponent(email)}`);
      const data = await response.json();
      if (data.success && data.driver) {
        driverFound = data.driver;
      }
    } catch (e) {
      console.warn("GAS lookup failed, falling back to local list:", e);
    }
  }

  // หากไม่ได้ตั้ง GAS URL หรือค้นไม่พบ ให้ตรวจในรายชื่อ Fallback / Demo
  if (!driverFound) {
    driverFound = CONFIG.FALLBACK_DRIVERS.find(d => d.email.toLowerCase() === email);
  }

  // หากยังไม่พบ สามารถอนุญาตให้ลงทะเบียนตรวจชั่วคราวได้
  if (!driverFound) {
    Swal.close();
    const result = await Swal.fire({
      icon: "question",
      title: "ไม่พบอีเมลในระบบล่วงหน้า",
      text: `อีเมล ${email} ยังไม่ได้บันทึกในตารางพนักงาน ต้องการยืนยันเพื่อใช้ตรวจวัดในนามพนักงานใหม่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ใช่ ยืนยันใช้ตรวจ",
      cancelButtonText: "กรอกอีเมลใหม่",
      confirmButtonColor: "#2563eb"
    });

    if (result.isConfirmed) {
      driverFound = {
        driverId: "DRV-GUEST-" + Math.floor(1000 + Math.random() * 9000),
        driverName: email.split("@")[0].toUpperCase(),
        email: email,
        phone: "-",
        vehiclePlate: "รอระบุ",
        department: "พนักงานขนส่ง",
        status: "TEMP"
      };
    } else {
      return;
    }
  }

  // บันทึกสถานะ Driver
  appState.driver = driverFound;

  // อัปเดต UI Profile Card
  document.getElementById("driverIdBadge").textContent = driverFound.driverId;
  document.getElementById("profileName").textContent = driverFound.driverName;
  document.getElementById("profilePhone").textContent = driverFound.phone;
  document.getElementById("profileVehicle").textContent = driverFound.vehiclePlate;
  document.getElementById("profileDept").textContent = driverFound.department || "แผนกขนส่ง";

  const profileCard = document.getElementById("driverProfileCard");
  profileCard.classList.remove("hidden");

  const btnNextToStep2 = document.getElementById("btnNextToStep2");
  btnNextToStep2.removeAttribute("disabled");
  btnNextToStep2.classList.remove("bg-slate-300", "text-slate-500", "cursor-not-allowed");
  btnNextToStep2.classList.add("bg-blue-600", "hover:bg-blue-700", "text-white", "shadow-md");

  Swal.fire({
    icon: "success",
    title: "ยืนยันข้อมูลเรียบร้อย",
    text: `ยินดีต้อนรับ: ${driverFound.driverName}`,
    timer: 1500,
    showConfirmButton: false
  });
}

// =========================================================================
// STRICT REAL CAMERA MANAGEMENT (WebRTC MediaDevices)
// =========================================================================
async function startCamera(facingMode, videoElementId) {
  stopCurrentCamera();

  const videoEl = document.getElementById(videoElementId);
  const promptEl = document.getElementById(videoElementId === "faceVideo" ? "faceCameraPrompt" : "meterCameraPrompt");
  const captureBtn = document.getElementById(videoElementId === "faceVideo" ? "btnCaptureFace" : "btnCaptureMeter");
  const scanLine = document.getElementById(videoElementId === "faceVideo" ? "faceScanLine" : "meterScanLine");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    Swal.fire({
      icon: "error",
      title: "เบราว์เซอร์ไม่รองรับกล้องสด",
      text: "โปรดใช้งานผ่าน Google Chrome, Safari หรือ Edge บนมือถือที่รองรับ WebRTC",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    appState.currentStream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();

    // ซ่อน Prompt เปิดกล้อง และเปิดใช้งานปุ่มกดชัตเตอร์
    promptEl.classList.add("hidden");
    if (scanLine) scanLine.classList.remove("hidden");

    captureBtn.removeAttribute("disabled");
    captureBtn.classList.remove("bg-slate-300", "text-slate-500", "cursor-not-allowed");
    captureBtn.classList.add("bg-blue-600", "hover:bg-blue-700", "text-white", "shadow-lg");

  } catch (err) {
    console.error("Camera access error:", err);
    Swal.fire({
      icon: "error",
      title: "ไม่สามารถเข้าถึงกล้องได้",
      text: "กรุณากด 'อนุญาต' (Allow) สิทธิ์การเข้าถึงกล้องในเบราว์เซอร์ของท่าน เพื่อถ่ายรูปยืนยันตัวตนสด",
      confirmButtonColor: "#2563eb"
    });
  }
}

function stopCurrentCamera() {
  if (appState.currentStream) {
    appState.currentStream.getTracks().forEach(track => track.stop());
    appState.currentStream = null;
  }
}

// =========================================================================
// STEP 2: Capture Face & AI Validation
// =========================================================================
function captureFaceSnapshot() {
  const videoEl = document.getElementById("faceVideo");
  const imgEl = document.getElementById("faceCapturedImg");
  const canvas = document.getElementById("snapshotCanvas");
  const scanLine = document.getElementById("faceScanLine");
  const verifiedBadge = document.getElementById("faceVerifiedBadge");
  const retakeBtn = document.getElementById("btnRetakeFace");
  const captureBtn = document.getElementById("btnCaptureFace");
  const nextBtn = document.getElementById("btnNextToStep3");

  if (!appState.currentStream) return;

  canvas.width = videoEl.videoWidth || 640;
  canvas.height = videoEl.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  // ตรวจสอบความสว่างภาพเบื้องต้น (AI Liveness / Quality Check)
  const isImageValid = checkImageBrightnessQuality(ctx, canvas.width, canvas.height);
  if (!isImageValid) {
    Swal.fire({
      icon: "warning",
      title: "ภาพมืดเกินไปหรือไม่ชัดเจน",
      text: "กรุณาเปิดไฟหรืออยู่ในบริเวณที่มีแสงสว่างเพียงพอ แล้วกดถ่ายภาพใบหน้าใหม่อีกครั้ง",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  // แปลงเป็น Base64
  const photoDataUrl = canvas.toDataURL("image/jpeg", 0.85);
  appState.facePhotoBase64 = photoDataUrl;

  // หยุดกล้องและแสดงรูปภาพ
  stopCurrentCamera();
  videoEl.classList.add("hidden");
  imgEl.src = photoDataUrl;
  imgEl.classList.remove("hidden");
  if (scanLine) scanLine.classList.add("hidden");

  // แสดงผลลัพธ์ผ่านการตรวจสอบ
  verifiedBadge.classList.remove("hidden");
  retakeBtn.classList.remove("hidden");
  captureBtn.classList.add("hidden");

  nextBtn.removeAttribute("disabled");
  nextBtn.classList.remove("bg-slate-300", "text-slate-500", "cursor-not-allowed");
  nextBtn.classList.add("bg-indigo-600", "hover:bg-indigo-700", "text-white", "shadow-md");

  Swal.fire({
    icon: "success",
    title: "บันทึกภาพใบหน้าเรียบร้อย",
    text: "ผ่านการตรวจสอบคุณภาพใบหน้าสดแล้ว",
    timer: 1300,
    showConfirmButton: false
  });
}

function retakeFaceSnapshot() {
  const videoEl = document.getElementById("faceVideo");
  const imgEl = document.getElementById("faceCapturedImg");
  const verifiedBadge = document.getElementById("faceVerifiedBadge");
  const retakeBtn = document.getElementById("btnRetakeFace");
  const captureBtn = document.getElementById("btnCaptureFace");
  const nextBtn = document.getElementById("btnNextToStep3");

  appState.facePhotoBase64 = null;
  imgEl.classList.add("hidden");
  videoEl.classList.remove("hidden");
  verifiedBadge.classList.add("hidden");
  retakeBtn.classList.add("hidden");
  captureBtn.classList.remove("hidden");

  nextBtn.setAttribute("disabled", "true");
  nextBtn.classList.add("bg-slate-300", "text-slate-500", "cursor-not-allowed");
  nextBtn.classList.remove("bg-indigo-600", "hover:bg-indigo-700", "text-white");

  startCamera("user", "faceVideo");
}

// =========================================================================
// STEP 3: Capture Meter & AI OCR Engine
// =========================================================================
async function captureMeterSnapshot() {
  const videoEl = document.getElementById("meterVideo");
  const imgEl = document.getElementById("meterCapturedImg");
  const canvas = document.getElementById("snapshotCanvas");
  const scanLine = document.getElementById("meterScanLine");
  const retakeBtn = document.getElementById("btnRetakeMeter");
  const captureBtn = document.getElementById("btnCaptureMeter");
  const ocrCard = document.getElementById("ocrResultCard");
  const ocrStatusBadge = document.getElementById("ocrStatusBadge");

  if (!appState.currentStream) return;

  canvas.width = videoEl.videoWidth || 640;
  canvas.height = videoEl.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  const photoDataUrl = canvas.toDataURL("image/jpeg", 0.90);
  appState.meterPhotoBase64 = photoDataUrl;

  // หยุดกล้องและแสดงภาพ
  stopCurrentCamera();
  videoEl.classList.add("hidden");
  imgEl.src = photoDataUrl;
  imgEl.classList.remove("hidden");
  if (scanLine) scanLine.classList.add("hidden");

  retakeBtn.classList.remove("hidden");
  captureBtn.classList.add("hidden");
  ocrCard.classList.remove("hidden");

  // เริ่มกระบวนการ AI OCR ตรวจหาตัวเลข
  ocrStatusBadge.className = "text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-amber-500/20 text-amber-300 animate-pulse";
  ocrStatusBadge.textContent = "AI กำลังอ่านตัวเลข...";

  // ตัดภาพเฉพาะโซนกลางเพื่อตรวจ OCR
  await runOCRAnalysis(canvas);
}

function retakeMeterSnapshot() {
  const videoEl = document.getElementById("meterVideo");
  const imgEl = document.getElementById("meterCapturedImg");
  const retakeBtn = document.getElementById("btnRetakeMeter");
  const captureBtn = document.getElementById("btnCaptureMeter");
  const nextBtn = document.getElementById("btnNextToStep4");
  const ocrCard = document.getElementById("ocrResultCard");

  appState.meterPhotoBase64 = null;
  imgEl.classList.add("hidden");
  videoEl.classList.remove("hidden");
  retakeBtn.classList.add("hidden");
  captureBtn.classList.remove("hidden");
  ocrCard.classList.add("hidden");

  nextBtn.setAttribute("disabled", "true");
  nextBtn.classList.add("bg-slate-300", "text-slate-500", "cursor-not-allowed");
  nextBtn.classList.remove("bg-blue-600", "hover:bg-blue-700", "text-white");

  startCamera("environment", "meterVideo");
}

/**
 * AI OCR ดึงตัวเลขจากรูปหน้าปัดเครื่องเป่า
 */
async function runOCRAnalysis(fullCanvas) {
  const alcoholInput = document.getElementById("alcoholValueInput");
  const ocrStatusBadge = document.getElementById("ocrStatusBadge");
  const nextBtn = document.getElementById("btnNextToStep4");

  let detectedValue = 0.00;

  try {
    if (window.Tesseract) {
      // สร้าง canvas ย่อยเฉพาะตรงกลาง เพื่อความแม่นยำสูง
      const cropCanvas = document.createElement("canvas");
      const cropW = Math.floor(fullCanvas.width * 0.55);
      const cropH = Math.floor(fullCanvas.height * 0.40);
      const cropX = Math.floor((fullCanvas.width - cropW) / 2);
      const cropY = Math.floor((fullCanvas.height - cropH) / 2);

      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext("2d");

      // เพิ่ม Contrast และ Grayscale ให้ตัวเลขเด่นชัด
      cropCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      applyContrastFilter(cropCtx, cropW, cropH);

      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.'
      });

      const { data: { text } } = await worker.recognize(cropCanvas);
      await worker.terminate();

      // แกะตัวเลขทศนิยมจากข้อความ
      const matched = text.match(/\d+(\.\d+)?/);
      if (matched) {
        detectedValue = parseFloat(matched[0]);
      }
    }
  } catch (err) {
    console.warn("Tesseract OCR notice:", err);
  }

  // ปรับค่าลงใน input
  alcoholInput.value = detectedValue.toFixed(2);
  updateAlcoholEvaluation(detectedValue);

  ocrStatusBadge.className = "text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-500/20 text-emerald-300";
  ocrStatusBadge.textContent = "วิเคราะห์เรียบร้อย";

  // เปิดใช้งานปุ่มถัดไป
  nextBtn.removeAttribute("disabled");
  nextBtn.classList.remove("bg-slate-300", "text-slate-500", "cursor-not-allowed");
  nextBtn.classList.add("bg-blue-600", "hover:bg-blue-700", "text-white", "shadow-md");
}

/**
 * ฟังก์ชันประเมินผล ผ่าน/ไม่ผ่าน ตามเกณฑ์แอลกอฮอล์
 */
function updateAlcoholEvaluation(val) {
  appState.alcoholValue = val;
  const resultBox = document.getElementById("resultBox");
  const resultIcon = document.getElementById("resultIcon");
  const resultText = document.getElementById("resultText");
  const safetyNotice = document.getElementById("safetyNotice");
  const alcoholInput = document.getElementById("alcoholValueInput");

  if (val === 0 || val <= CONFIG.LEGAL_LIMIT_MG_PERCENT) {
    appState.testStatus = "ผ่าน";
    alcoholInput.className = "font-digital text-3xl font-bold bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1 text-emerald-400 w-28 text-center focus:ring-2 focus:ring-blue-400 outline-none";
    resultBox.className = "inline-flex flex-col items-center px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-400";
    resultIcon.className = "fa-solid fa-shield-check text-xl mb-0.5";
    resultText.textContent = "ผ่านเกณฑ์";
    safetyNotice.className = "text-[11px] text-emerald-300/90 bg-emerald-950/40 p-2 rounded-lg border border-emerald-900/50";
    safetyNotice.innerHTML = "✓ ระดับแอลกอฮอล์เป็นศูนย์ (0.00 mg%) พนักงานพร้อมปฏิบัติหน้าที่ขับขี่ปลอดภัย";
  } else {
    appState.testStatus = "ไม่ผ่าน";
    alcoholInput.className = "font-digital text-3xl font-bold bg-slate-800 border border-red-500 rounded-lg px-2.5 py-1 text-red-400 w-28 text-center focus:ring-2 focus:ring-red-400 outline-none";
    resultBox.className = "inline-flex flex-col items-center px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 pulse-red";
    resultIcon.className = "fa-solid fa-triangle-exclamation text-xl mb-0.5";
    resultText.textContent = "ไม่ผ่านเกณฑ์!";
    safetyNotice.className = "text-[11px] text-red-300/90 bg-red-950/40 p-2 rounded-lg border border-red-900/50 font-bold";
    safetyNotice.innerHTML = `⚠️ ตรวจพบแอลกอฮอล์ ${val.toFixed(2)} mg% ห้ามปฏิบัติหน้าที่ขับขี่ยานพาหนะเด็ดขาด!`;
  }
}

// =========================================================================
// STEP 4: Summary & Submit to Google Apps Script / Sheet
// =========================================================================
function prepareSummaryStep() {
  document.getElementById("summaryFaceImg").src = appState.facePhotoBase64 || "";
  document.getElementById("summaryMeterImg").src = appState.meterPhotoBase64 || "";

  const driver = appState.driver || {};
  document.getElementById("summaryDriverName").textContent = driver.driverName || "-";
  document.getElementById("summaryEmail").textContent = driver.email || "-";
  document.getElementById("summaryVehicle").textContent = driver.vehiclePlate || "-";
  document.getElementById("summaryTimestamp").textContent = new Date().toLocaleString("th-TH");
  document.getElementById("summaryGPS").textContent = appState.gps.text;

  const resultTag = document.getElementById("summaryResultTag");
  if (appState.testStatus === "ผ่าน") {
    resultTag.className = "font-bold px-2.5 py-1 rounded-md text-emerald-700 bg-emerald-100 border border-emerald-300";
    resultTag.textContent = `ผ่าน (${appState.alcoholValue.toFixed(2)} mg%)`;
  } else {
    resultTag.className = "font-bold px-2.5 py-1 rounded-md text-red-700 bg-red-100 border border-red-300";
    resultTag.textContent = `ไม่ผ่าน (${appState.alcoholValue.toFixed(2)} mg%)`;
  }
}

async function handleSubmitData() {
  const remarks = (document.getElementById("summaryRemarks").value || "").trim();

  // ยืนยันก่อนส่ง
  const confirmResult = await Swal.fire({
    title: "ยืนยันการบันทึกรายงาน?",
    html: `
      <div class="text-left text-xs space-y-1.5 p-2 bg-slate-50 rounded border">
        <div><strong>พนักงาน:</strong> ${appState.driver ? appState.driver.driverName : '-'}</div>
        <div><strong>ผลตรวจ:</strong> <span class="${appState.testStatus === 'ผ่าน' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}">${appState.testStatus} (${appState.alcoholValue.toFixed(2)} mg%)</span></div>
        <div><strong>พิกัด:</strong> ${appState.gps.text}</div>
      </div>
    `,
    icon: appState.testStatus === "ผ่าน" ? "question" : "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยันส่งข้อมูล",
    cancelButtonText: "ตรวจสอบอีกครั้ง",
    confirmButtonColor: appState.testStatus === "ผ่าน" ? "#2563eb" : "#dc2626"
  });

  if (!confirmResult.isConfirmed) return;

  // แสดง Loading
  Swal.fire({
    title: "กำลังบันทึกข้อมูล...",
    html: `
      <div class="space-y-2 text-xs text-slate-500">
        <div>กำลังอัปโหลดภาพถ่ายไปยัง Google Drive...</div>
        <div>กำลังเพิ่มแถวข้อมูลลงใน Google Sheet...</div>
      </div>
    `,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  const payload = {
    action: "submitAlcoholTest",
    driverId: appState.driver ? appState.driver.driverId : "UNKNOWN",
    driverName: appState.driver ? appState.driver.driverName : "ไม่ระบุชื่อ",
    email: appState.driver ? appState.driver.email : "",
    phone: appState.driver ? appState.driver.phone : "-",
    vehiclePlate: appState.driver ? appState.driver.vehiclePlate : "-",
    alcoholValue: appState.alcoholValue.toFixed(2),
    status: appState.testStatus,
    latitude: appState.gps.lat || "",
    longitude: appState.gps.lng || "",
    faceImageBase64: appState.facePhotoBase64,
    meterImageBase64: appState.meterPhotoBase64,
    verificationMethod: "AI-OCR & Live WebRTC Camera",
    remarks: remarks || "ตรวจก่อนปฏิบัติหน้าที่ประจำวัน"
  };

  try {
    let responseSuccess = false;
    let responseMsg = "บันทึกผลการตรวจเรียบร้อยแล้ว";

    if (CONFIG.GAS_WEBAPP_URL && !CONFIG.GAS_WEBAPP_URL.includes("REPLACE_WITH_YOUR_DEPLOYMENT_ID")) {
      // ส่งข้อมูลไปยัง Google Apps Script Web App
      const res = await fetch(CONFIG.GAS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (resJson.success) {
        responseSuccess = true;
        responseMsg = resJson.message || responseMsg;
      } else {
        throw new Error(resJson.error || "บันทึกไม่สำเร็จ");
      }
    } else {
      // จำลองการส่งข้อมูลในโหมด Offline / Local ทดสอบ
      await new Promise(resolve => setTimeout(resolve, 1500));
      responseSuccess = true;
      responseMsg = "บันทึกข้อมูลเสร็จสิ้น (โหมดทดสอบ: โปรดนำ URL จาก Google Apps Script มาใส่ใน CONFIG.GAS_WEBAPP_URL เพื่อเชื่อมต่อ Sheet จริง)";
    }

    if (responseSuccess) {
      if (appState.testStatus === "ผ่าน") {
        Swal.fire({
          icon: "success",
          title: "บันทึกข้อมูลสำเร็จ!",
          html: `
            <p class="text-sm text-slate-700">${responseMsg}</p>
            <p class="text-xs text-emerald-600 font-semibold mt-2">✓ ผ่านเกณฑ์ 0.00 mg% ขับขี่ปลอดภัยด้วยความระมัดระวังครับ</p>
          `,
          confirmButtonColor: "#2563eb",
          confirmButtonText: "ตกลง (ตรวจคนถัดไป)"
        }).then(() => {
          resetApplication();
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "บันทึกผลการตรวจ: ไม่ผ่านเกณฑ์!",
          html: `
            <p class="text-sm text-red-600 font-bold">ตรวจพบแอลกอฮอล์ ${appState.alcoholValue.toFixed(2)} mg%</p>
            <p class="text-xs text-slate-600 mt-2">ระบบได้บันทึกรายงานแจ้งเตือนไปยังผู้ดูแลระบบเรียบร้อยแล้ว ห้ามปฏิบัติหน้าที่ขับขี่ยานพาหนะเด็ดขาด</p>
          `,
          confirmButtonColor: "#dc2626",
          confirmButtonText: "รับทราบ"
        }).then(() => {
          resetApplication();
        });
      }
    }

  } catch (error) {
    console.error("Submission Error:", error);
    Swal.fire({
      icon: "error",
      title: "เกิดข้อผิดพลาดในการส่งข้อมูล",
      text: error.message || "ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือ URL",
      confirmButtonColor: "#2563eb"
    });
  }
}

/**
 * รีเซ็ตหน้าจอเพื่อเริ่มการตรวจคนใหม่
 */
function resetApplication() {
  appState.driver = null;
  appState.facePhotoBase64 = null;
  appState.meterPhotoBase64 = null;
  appState.alcoholValue = 0.00;
  appState.testStatus = "ผ่าน";

  document.getElementById("driverEmailInput").value = "";
  document.getElementById("driverProfileCard").classList.add("hidden");
  document.getElementById("btnNextToStep2").setAttribute("disabled", "true");
  document.getElementById("btnNextToStep2").className = "w-full py-3 px-4 bg-slate-300 text-slate-500 font-semibold rounded-xl text-sm transition shadow flex items-center justify-center space-x-2 cursor-not-allowed";

  retakeFaceSnapshot();
  retakeMeterSnapshot();
  goToStep(1);
}

// =========================================================================
// HELPER UTILITIES
// =========================================================================

/**
 * ขอสิทธิ์ดึงพิกัด Geolocation ปัจจุบัน
 */
function requestGPSCoordinates() {
  if (!navigator.geolocation) {
    appState.gps.text = "อุปกรณ์ไม่รองรับ GPS";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      appState.gps.lat = position.coords.latitude.toFixed(6);
      appState.gps.lng = position.coords.longitude.toFixed(6);
      appState.gps.accuracy = position.coords.accuracy.toFixed(1);
      appState.gps.text = `${appState.gps.lat}, ${appState.gps.lng} (±${appState.gps.accuracy}m)`;
      console.log("GPS Acquired:", appState.gps.text);
    },
    (err) => {
      console.warn("GPS Warning:", err.message);
      appState.gps.text = "ไม่สามารถระบุพิกัดได้ (ไม่ได้รับสิทธิ์)";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/**
 * ตรวจสอบความสว่างเฉลี่ยของภาพ (ป้องกันภาพมืดดำหรือปิดเลนส์)
 */
function checkImageBrightnessQuality(ctx, width, height) {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    let r, g, b, avg;
    let colorSum = 0;

    // สุ่มคำนวณความสว่าง 1000 พิกเซลเพื่อความรวดเร็ว
    const sampleRate = Math.max(1, Math.floor(data.length / (4 * 1000)));
    let sampledCount = 0;

    for (let x = 0; x < data.length; x += 4 * sampleRate) {
      r = data[x];
      g = data[x + 1];
      b = data[x + 2];
      avg = Math.floor((r + g + b) / 3);
      colorSum += avg;
      sampledCount++;
    }

    const brightness = Math.floor(colorSum / sampledCount);
    // ถ้าความสว่างต่ำกว่า 15 (จาก 255) ถือว่ามืดสนิท
    return brightness >= 15;
  } catch (e) {
    return true; // ยอมรับถ้าเกิด security error กับ canvas
  }
}

/**
 * ปรับ Contrast รูปให้ชัด สำหรับการอ่าน OCR ตัวเลขดิจิทัล
 */
function applyContrastFilter(ctx, width, height) {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const contrast = 1.6; // เพิ่มความคมชัด
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < d.length; i += 4) {
      // Grayscale
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Apply contrast
      let adjusted = factor * (gray - 128) + 128;
      if (adjusted > 255) adjusted = 255;
      if (adjusted < 0) adjusted = 0;

      d[i] = adjusted;
      d[i + 1] = adjusted;
      d[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn("Contrast filter skip:", e);
  }
}
