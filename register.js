/**
 * =========================================================================
 * Registration & Master Face Logic (register.js)
 * หจก. ทั่วไทยขนส่งมงคล (Mr.Taweesak.kom - 062-3285963)
 * =========================================================================
 */

const REG_CONFIG = {
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbygXhKLj8jXNkY70z8w5_UYVbrAET_SfJ6l33HX16Tu1pkK9UsVWgc60rRnv1WcaeKeFg/exec",
  FACE_API_MODELS_URL: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/"
};

function getGasWebAppUrl() {
  const localUrl = localStorage.getItem("TTMK_GAS_URL");
  if (localUrl && localUrl.trim().startsWith("https://script.google.com/macros/s/")) {
    return localUrl.trim();
  }
  return REG_CONFIG.GAS_WEBAPP_URL;
}

function saveGasWebAppUrl(url) {
  const cleanUrl = (url || "").trim();
  localStorage.setItem("TTMK_GAS_URL", cleanUrl);
  REG_CONFIG.GAS_WEBAPP_URL = cleanUrl;
}

function toDirectDriveImageUrl(url) {
  if (!url) return "";
  if (url.includes("lh3.googleusercontent.com")) return url;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

const regState = {
  isEditMode: false,
  existingDriver: null,
  masterFaceBase64: null,
  faceDescriptor: null,
  stream: null,
  modelsLoaded: false
};

document.addEventListener("DOMContentLoaded", async () => {
  await verifyAdminAccess();
  initRegistrationEvents();
  loadFaceModels();

  // ตรวจสอบ Parameter จาก URL เช่น ?email=...
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get("email");
  if (emailParam) {
    const lookupInput = document.getElementById("lookupDriverInput");
    if (lookupInput) lookupInput.value = emailParam.trim();
    await lookupExistingDriver(emailParam.trim());
  }
});

/**
 * ตรวจสอบรหัสผ่านเจ้าหน้าที่ก่อนเข้าใช้งาน (Passcode: 44Cone38)
 */
async function verifyAdminAccess() {
  const currentAuth = sessionStorage.getItem("TTMK_ADMIN_AUTH");
  if (currentAuth === "44Cone38") return;

  const { value: passcode } = await Swal.fire({
    title: "ระบบความปลอดภัยเจ้าหน้าที่",
    html: `<div class="text-xs text-slate-500 mb-2">หน้านี้อนุญาตเฉพาะเจ้าหน้าที่ลงทะเบียนเท่านั้น โปรดใส่รหัสผ่านเพื่อเข้าใช้งาน</div>`,
    input: "password",
    inputPlaceholder: "กรุณาใส่รหัสผ่าน",
    allowOutsideClick: false,
    allowEscapeKey: false,
    showCancelButton: true,
    confirmButtonText: "ยืนยันรหัส",
    cancelButtonText: "กลับหน้าหลัก",
    confirmButtonColor: "#2563eb",
    cancelButtonColor: "#64748b"
  });

  if (passcode === "44Cone38") {
    sessionStorage.setItem("TTMK_ADMIN_AUTH", "44Cone38");
    Swal.fire({
      icon: "success",
      title: "รหัสผ่านถูกต้อง",
      timer: 1000,
      showConfirmButton: false
    });
  } else {
    Swal.fire({
      icon: "error",
      title: "รหัสผ่านไม่ถูกต้อง!",
      text: "ระบบจะนำท่านกลับสู่หน้าตรวจวัด",
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      window.location.href = "index.html";
    });
  }
}

/**
 * โหลด Face API Models สำหรับสกัด 128-d Vector
 */
async function loadFaceModels() {
  try {
    if (window.faceapi) {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(REG_CONFIG.FACE_API_MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(REG_CONFIG.FACE_API_MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(REG_CONFIG.FACE_API_MODELS_URL)
      ]);
      regState.modelsLoaded = true;
      console.log("Face API Models loaded successfully");
    }
  } catch (err) {
    console.warn("Face-api models notice (will use standard facial vector):", err);
  }
}

/**
 * กำหนด Event Listeners
 */
function initRegistrationEvents() {
  const btnStartCamera = document.getElementById("btnStartMasterCamera");
  const btnCapture = document.getElementById("btnCaptureMaster");
  const btnRetake = document.getElementById("btnRetakeMaster");
  const btnSubmit = document.getElementById("btnSubmitRegistration");
  const lookupInput = document.getElementById("lookupDriverInput");
  const btnLookup = document.getElementById("btnLookupDriver");
  const btnResetMode = document.getElementById("btnResetToNewMode");

  if (btnStartCamera) btnStartCamera.addEventListener("click", () => startMasterCamera());
  if (btnCapture) btnCapture.addEventListener("click", () => captureMasterFace());
  if (btnRetake) btnRetake.addEventListener("click", () => retakeMasterFace());
  if (btnSubmit) btnSubmit.addEventListener("click", () => submitRegistration());
  if (btnLookup) btnLookup.addEventListener("click", () => handleLookupDriverClick());
  if (btnResetMode) btnResetMode.addEventListener("click", () => resetFormToNewMode());

  if (lookupInput) {
    lookupInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") handleLookupDriverClick();
    });
  }
}

/**
 * จัดการเมื่อกดปุ่มค้นหาข้อมูลเดิม
 */
function handleLookupDriverClick() {
  const inputEl = document.getElementById("lookupDriverInput");
  const val = inputEl ? inputEl.value.trim() : "";
  if (!val) {
    Swal.fire({
      icon: "warning",
      title: "โปรดใส่อีเมลพนักงาน",
      text: "กรุณาระบุอีเมลพนักงานที่ต้องการดึงข้อมูลมาแก้ไข",
      confirmButtonColor: "#2563eb"
    });
    return;
  }
  lookupExistingDriver(val);
}

/**
 * ค้นหาข้อมูลพนักงานเดิมจาก Google Sheet
 */
async function lookupExistingDriver(searchKey) {
  if (!searchKey) return;
  const cleanKey = searchKey.trim().toLowerCase();

  Swal.fire({
    title: "กำลังค้นหาข้อมูล...",
    html: `<div class="text-xs text-slate-500">กำลังดึงข้อมูลพนักงานจากฐานข้อมูล Google Sheet...</div>`,
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const gasUrl = getGasWebAppUrl();
    const res = await fetch(`${gasUrl}?action=checkEmail&email=${encodeURIComponent(cleanKey)}`);
    const data = await res.json();

    if (data && data.success && data.driver) {
      applyExistingDriverData(data.driver);
      Swal.fire({
        icon: "success",
        title: "พบข้อมูลพนักงาน!",
        html: `
          <div class="text-xs text-slate-600 space-y-1">
            <p><b>ชื่อ:</b> ${data.driver.driverName || "-"}</p>
            <p><b>รหัส:</b> ${data.driver.driverId || "-"}</p>
            <p><b>ทะเบียน:</b> ${data.driver.vehiclePlate || "-"}</p>
          </div>
        `,
        timer: 1800,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        icon: "info",
        title: "ไม่พบข้อมูลพนักงานเดิม",
        text: `ไม่พบอีเมล "${searchKey}" ในระบบทะเบียนพนักงาน ท่านสามารถกรอกเพื่อลงทะเบียนใหม่ได้ทันที`,
        confirmButtonColor: "#2563eb"
      });
    }
  } catch (err) {
    console.error("Lookup error:", err);
    Swal.fire({
      icon: "error",
      title: "การเชื่อมต่อล้มเหลว",
      text: err.message || "ไม่สามารถดึงข้อมูลจากระบบได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
      confirmButtonColor: "#2563eb"
    });
  }
}

/**
 * นำข้อมูลพนักงานเดิมมาแสดงในฟอร์ม และสลับเป็นโหมดแก้ไข
 */
function applyExistingDriverData(driver) {
  if (!driver) return;
  regState.isEditMode = true;
  regState.existingDriver = driver;

  // กรอกข้อมูลลงฟอร์ม
  const driverIdEl = document.getElementById("regDriverId");
  const driverNameEl = document.getElementById("regDriverName");
  const emailEl = document.getElementById("regEmail");
  const phoneEl = document.getElementById("regPhone");
  const plateEl = document.getElementById("regPlate");
  const deptEl = document.getElementById("regDept");

  if (driverIdEl) driverIdEl.value = driver.driverId || "";
  if (driverNameEl) driverNameEl.value = driver.driverName || "";
  if (emailEl) emailEl.value = driver.email || "";
  if (phoneEl) phoneEl.value = driver.phone || "";
  if (plateEl) plateEl.value = driver.vehiclePlate || "";
  if (deptEl && driver.department) deptEl.value = driver.department;

  // อัปเดต UI Mode Badge
  const regModeBadge = document.getElementById("regModeBadge");
  const regModeIcon = document.getElementById("regModeIcon");
  const regModeText = document.getElementById("regModeText");
  const btnReset = document.getElementById("btnResetToNewMode");
  const btnSubmitText = document.getElementById("btnSubmitText");
  const btnSubmitIcon = document.getElementById("btnSubmitIcon");

  if (regModeBadge) {
    regModeBadge.classList.remove("bg-blue-100", "text-blue-800", "border-blue-200");
    regModeBadge.classList.add("bg-amber-100", "text-amber-800", "border-amber-200");
  }
  if (regModeIcon) {
    regModeIcon.className = "fa-solid fa-user-pen text-[10px]";
  }
  if (regModeText) {
    regModeText.textContent = `โหมดแก้ไข: ${driver.driverName || driver.driverId}`;
  }
  if (btnReset) btnReset.classList.remove("hidden");

  if (btnSubmitText) btnSubmitText.textContent = "บันทึกการอัปเดตข้อมูลพนักงาน & ใบหน้าใหม่";
  if (btnSubmitIcon) btnSubmitIcon.className = "fa-solid fa-cloud-arrow-up text-base";

  // แสดงรูปใบหน้าเดิมหากมีในระบบ
  const existingMasterSec = document.getElementById("existingMasterSection");
  const existingMasterImg = document.getElementById("existingMasterImg");
  const masterPhotoUrl = driver.masterFaceUrl || driver.masterFacePhoto || "";

  if (existingMasterSec && existingMasterImg && masterPhotoUrl) {
    existingMasterImg.src = toDirectDriveImageUrl(masterPhotoUrl);
    existingMasterSec.classList.remove("hidden");
  } else if (existingMasterSec) {
    existingMasterSec.classList.add("hidden");
  }
}

/**
 * ล้างฟอร์มและรีเซ็ตกลับเป็นโหมดลงทะเบียนใหม่
 */
function resetFormToNewMode() {
  regState.isEditMode = false;
  regState.existingDriver = null;
  regState.masterFaceBase64 = null;
  regState.faceDescriptor = null;

  // ล้างค่าใน Input
  const fields = ["regDriverId", "regDriverName", "regEmail", "regPhone", "regPlate", "lookupDriverInput"];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // รีเซ็ต UI
  const regModeBadge = document.getElementById("regModeBadge");
  const regModeIcon = document.getElementById("regModeIcon");
  const regModeText = document.getElementById("regModeText");
  const btnReset = document.getElementById("btnResetToNewMode");
  const btnSubmitText = document.getElementById("btnSubmitText");
  const btnSubmitIcon = document.getElementById("btnSubmitIcon");
  const existingMasterSec = document.getElementById("existingMasterSection");

  if (regModeBadge) {
    regModeBadge.classList.remove("bg-amber-100", "text-amber-800", "border-amber-200");
    regModeBadge.classList.add("bg-blue-100", "text-blue-800", "border-blue-200");
  }
  if (regModeIcon) regModeIcon.className = "fa-solid fa-user-plus text-[10px]";
  if (regModeText) regModeText.textContent = "โหมด: ลงทะเบียนพนักงานใหม่";
  if (btnReset) btnReset.classList.add("hidden");
  if (existingMasterSec) existingMasterSec.classList.add("hidden");

  if (btnSubmitText) btnSubmitText.textContent = "บันทึกการลงทะเบียนพนักงาน";
  if (btnSubmitIcon) btnSubmitIcon.className = "fa-solid fa-user-check text-base";

  // รีเซ็ตกล้อง
  const videoEl = document.getElementById("masterFaceVideo");
  const imgEl = document.getElementById("masterFaceImg");
  const promptEl = document.getElementById("masterCameraPrompt");
  const captureBtn = document.getElementById("btnCaptureMaster");
  const retakeBtn = document.getElementById("btnRetakeMaster");

  stopMasterCamera();
  if (videoEl) videoEl.classList.remove("hidden");
  if (imgEl) imgEl.classList.add("hidden");
  if (promptEl) promptEl.classList.remove("hidden");
  if (retakeBtn) retakeBtn.classList.add("hidden");
  if (captureBtn) {
    captureBtn.classList.remove("hidden");
    captureBtn.disabled = true;
    captureBtn.classList.add("bg-slate-300", "text-slate-500", "cursor-not-allowed");
    captureBtn.classList.remove("bg-blue-600", "hover:bg-blue-700", "text-white", "shadow-md", "cursor-pointer");
  }
}

window.handleLookupDriverClick = handleLookupDriverClick;
window.lookupExistingDriver = lookupExistingDriver;
window.applyExistingDriverData = applyExistingDriverData;
window.resetFormToNewMode = resetFormToNewMode;

/**
 * เปิดกล้องหน้าสด (รองรับ iOS Safari และ Android 100%)
 */
async function startMasterCamera() {
  stopMasterCamera();

  const videoEl = document.getElementById("masterFaceVideo");
  const promptEl = document.getElementById("masterCameraPrompt");
  const captureBtn = document.getElementById("btnCaptureMaster");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    Swal.fire({
      icon: "error",
      title: "อุปกรณ์ไม่รองรับกล้อง",
      text: "โปรดใช้งานผ่านเบราว์เซอร์ Chrome หรือ Safari บนมือถือ",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  try {
    // ปรับ Constraints แบบสากลที่ iOS Safari ไม่ปฏิเสธ
    const constraints = {
      video: { facingMode: "user" },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    regState.stream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();

    promptEl.classList.add("hidden");
    captureBtn.removeAttribute("disabled");
    captureBtn.disabled = false;
    captureBtn.classList.remove("bg-slate-300", "text-slate-500", "cursor-not-allowed");
    captureBtn.classList.add("bg-blue-600", "hover:bg-blue-700", "text-white", "shadow-md", "cursor-pointer");
  } catch (e) {
    console.error("Camera error:", e);
    Swal.fire({
      icon: "error",
      title: "ไม่สามารถเปิดกล้องได้",
      text: "กรุณากด 'อนุญาต' (Allow) สิทธิ์เข้าถึงกล้องในเบราว์เซอร์ Safari/Chrome",
      confirmButtonColor: "#2563eb"
    });
  }
}

function stopMasterCamera() {
  if (regState.stream) {
    regState.stream.getTracks().forEach(track => track.stop());
    regState.stream = null;
  }
}

// ผูกฟังก์ชันเข้ากับ window เพื่อให้ปุ่ม onclick เรียกได้ตลอดเวลา
window.startMasterCamera = startMasterCamera;
window.captureMasterFace = captureMasterFace;
window.retakeMasterFace = retakeMasterFace;
window.submitRegistration = submitRegistration;

/**
 * ถ่ายภาพหน้าต้นแบบ & สกัด 128-d Face Descriptor
 */
async function captureMasterFace() {
  const videoEl = document.getElementById("masterFaceVideo");
  const imgEl = document.getElementById("masterFaceImg");
  const canvas = document.getElementById("regCanvas");
  const extractingEl = document.getElementById("masterAiExtracting");
  const retakeBtn = document.getElementById("btnRetakeMaster");
  const captureBtn = document.getElementById("btnCaptureMaster");

  if (!regState.stream) return;

  canvas.width = videoEl.videoWidth || 640;
  canvas.height = videoEl.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  // กลับด้านแนวนอน (Mirror) เพื่อให้ภาพที่บันทึกตรงกับที่เห็นในจอกระจก ไม่หลอกตา
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  const photoDataUrl = canvas.toDataURL("image/jpeg", 0.90);
  regState.masterFaceBase64 = photoDataUrl;

  stopMasterCamera();
  videoEl.classList.add("hidden");
  imgEl.src = photoDataUrl;
  imgEl.classList.remove("hidden");

  extractingEl.classList.remove("hidden");

  // วิเคราะห์ใบหน้าด้วย Face-API สกัดเวกเตอร์ 128 มิติ (128-d Vector)
  try {
    if (!regState.modelsLoaded && window.faceapi) {
      await loadFaceModels();
    }

    let descriptor = null;
    if (window.faceapi && regState.modelsLoaded) {
      let detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }))
                                   .withFaceLandmarks()
                                   .withFaceDescriptor();
      if (!detection) {
        detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }))
                                 .withFaceLandmarks()
                                 .withFaceDescriptor();
      }
      if (detection && detection.descriptor) {
        descriptor = Array.from(detection.descriptor);
      }
    }

    if (!descriptor || descriptor.length !== 128) {
      extractingEl.classList.add("hidden");
      Swal.fire({
        icon: "warning",
        title: "ตรวจไม่พบใบหน้าในภาพถ่าย",
        text: "กรุณามองตรงหน้ากล้องให้อยู่กึ่งกลางกรอบวงรี ถอดหมวก/แว่นตา และอยู่ในที่สว่าง แล้วกดถ่ายใหม่อีกครั้ง",
        confirmButtonColor: "#2563eb",
        confirmButtonText: "ถ่ายใหม่"
      }).then(() => {
        retakeMasterFace();
      });
      return;
    }

    regState.faceDescriptor = descriptor;
    extractingEl.classList.add("hidden");
    retakeBtn.classList.remove("hidden");
    captureBtn.classList.add("hidden");

    Swal.fire({
      icon: "success",
      title: "บันทึกภาพใบหน้าสำเร็จ",
      text: "AI วิเคราะห์และสกัดเวกเตอร์ใบหน้า 128 มิติ (128-d Vector) เรียบร้อยแล้ว",
      timer: 1500,
      showConfirmButton: false
    });
  } catch (err) {
    console.error("Face capture analysis error:", err);
    extractingEl.classList.add("hidden");
    Swal.fire({
      icon: "error",
      title: "เกิดข้อผิดพลาดในการวิเคราะห์ใบหน้า",
      text: err.message || "ไม่สามารถวิเคราะห์จุดเด่นใบหน้าได้ กรุณาลองใหม่อีกครั้ง",
      confirmButtonColor: "#2563eb"
    });
  }
}

function retakeMasterFace() {
  const videoEl = document.getElementById("masterFaceVideo");
  const imgEl = document.getElementById("masterFaceImg");
  const retakeBtn = document.getElementById("btnRetakeMaster");
  const captureBtn = document.getElementById("btnCaptureMaster");

  regState.masterFaceBase64 = null;
  regState.faceDescriptor = null;

  imgEl.classList.add("hidden");
  videoEl.classList.remove("hidden");
  retakeBtn.classList.add("hidden");
  captureBtn.classList.remove("hidden");

  startMasterCamera();
}

/**
 * สร้าง Fallback Facial Vector 64-point เพื่อใช้เปรียบเทียบกรณีไม่มี Model เต็ม
 */
function generateFallbackFacialVector(ctx, w, h) {
  const vector = [];
  const stepX = Math.floor(w / 8);
  const stepY = Math.floor(h / 8);
  for (let y = stepY; y < h; y += stepY) {
    for (let x = stepX; x < w; x += stepX) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const gray = (pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114) / 255.0;
      vector.push(parseFloat(gray.toFixed(4)));
    }
  }
  return vector;
}

/**
 * ส่งข้อมูลลงทะเบียนไปยัง Google Apps Script
 */
async function submitRegistration() {
  const driverId = (document.getElementById("regDriverId").value || "").trim();
  const driverName = (document.getElementById("regDriverName").value || "").trim();
  const email = (document.getElementById("regEmail").value || "").trim().toLowerCase();
  const phone = (document.getElementById("regPhone").value || "").trim();
  const plate = (document.getElementById("regPlate").value || "").trim();
  const dept = document.getElementById("regDept").value;

  if (!driverId || !driverName || !email) {
    Swal.fire({
      icon: "warning",
      title: "กรุณากรอกข้อมูลให้ครบถ้วน",
      text: "โปรดระบุ รหัสพนักงาน, ชื่อ-สกุล และอีเมล",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  const hasExistingMaster = !!(regState.existingDriver && (regState.existingDriver.masterFaceUrl || regState.existingDriver.masterFacePhoto));

  if (!regState.masterFaceBase64 && !hasExistingMaster) {
    Swal.fire({
      icon: "warning",
      title: "ยังไม่ได้ถ่ายภาพใบหน้าต้นแบบ",
      text: "กรุณาเปิดกล้องหน้าและกดถ่ายรูปใบหน้าต้นแบบก่อนบันทึก",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  const isEdit = regState.isEditMode;
  const isPhotoUpdated = !!regState.masterFaceBase64;

  Swal.fire({
    title: isEdit ? "กำลังบันทึกการอัปเดต..." : "กำลังบันทึกข้อมูล...",
    html: `<div class="text-xs text-slate-500">${isPhotoUpdated ? "กำลังอัปโหลดใบหน้าต้นแบบใหม่ไปยัง Google Drive และอัปเดตข้อมูล..." : "กำลังบันทึกข้อมูลพนักงานลงฐานข้อมูล Google Sheet..."}</div>`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  const payload = {
    action: "registerDriver",
    driverId: driverId,
    driverName: driverName,
    email: email,
    phone: phone,
    vehiclePlate: plate,
    department: dept,
    masterFaceImageBase64: regState.masterFaceBase64 || "",
    faceDescriptorJson: regState.faceDescriptor ? JSON.stringify(regState.faceDescriptor) : ""
  };

  try {
    let success = false;
    let message = isEdit ? "อัปเดตข้อมูลพนักงานเรียบร้อยแล้ว" : "ลงทะเบียนพนักงานและบันทึกใบหน้าต้นแบบเรียบร้อย";
    let masterUrl = "";

    let targetGasUrl = getGasWebAppUrl();
    const isDummy = !targetGasUrl || targetGasUrl.includes("REPLACE_WITH_YOUR_DEPLOYMENT_ID");

    if (isDummy) {
      const { value: enteredUrl } = await Swal.fire({
        icon: "warning",
        title: "ยังไม่ได้เชื่อมต่อ Google Apps Script!",
        html: `
          <div class="text-xs text-slate-600 text-left space-y-2 mb-3">
            <p class="font-bold text-red-600 text-sm">ข้อมูลยังไม่สามารถบันทึกลงชีต Registered_Drivers หรือ Drive ได้</p>
            <p>กรุณาวาง <b>Web App URL</b> จาก Google Apps Script (ลงท้ายด้วย <code>/exec</code>) เพื่อบันทึกข้อมูลพนักงานและรูปหน้าต้นแบบ:</p>
          </div>
        `,
        input: "text",
        inputPlaceholder: "https://script.google.com/macros/s/AKfycb.../exec",
        showCancelButton: true,
        confirmButtonText: "บันทึกและส่งข้อมูล",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        inputValidator: (val) => {
          if (!val || !val.includes("script.google.com") || !val.includes("/exec")) {
            return "กรุณาระบุ Web App URL ที่ถูกต้อง (ขึ้นต้นด้วย https://script.google.com และลงท้ายด้วย /exec)";
          }
        }
      });

      if (enteredUrl) {
        saveGasWebAppUrl(enteredUrl.trim());
        targetGasUrl = enteredUrl.trim();
      } else {
        return;
      }
    }

    const res = await fetch(targetGasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      success = true;
      message = data.message || message;
      masterUrl = data.masterFaceUrl || "";
    } else {
      throw new Error(data.error || "บันทึกไม่สำเร็จ");
    }

    if (success) {
      // บันทึกลงใน LocalStorage เพื่อให้หน้าตรวจวัด Auto-Login ใช้งานได้ทันที
      const existingLocal = JSON.parse(localStorage.getItem("TTMK_DRIVER_PROFILE") || "{}");
      const localDriverData = {
        driverId: driverId,
        driverName: driverName,
        email: email,
        phone: phone,
        vehiclePlate: plate,
        department: dept,
        masterFacePhoto: regState.masterFaceBase64 || (regState.existingDriver ? (regState.existingDriver.masterFacePhoto || regState.existingDriver.masterFaceUrl) : "") || existingLocal.masterFacePhoto || "",
        masterFaceDescriptor: regState.faceDescriptor || (regState.existingDriver ? regState.existingDriver.faceDescriptor : null) || existingLocal.masterFaceDescriptor || null,
        masterFaceUrl: masterUrl || (regState.existingDriver ? regState.existingDriver.masterFaceUrl : "") || existingLocal.masterFaceUrl || ""
      };
      localStorage.setItem("TTMK_DRIVER_PROFILE", JSON.stringify(localDriverData));

      Swal.fire({
        icon: "success",
        title: isEdit ? "อัปเดตข้อมูลพนักงานสำเร็จ!" : "ลงทะเบียนสำเร็จ!",
        html: `
          <p class="text-xs text-slate-600 mb-2">${message}</p>
          <p class="text-xs text-emerald-600 font-bold">${isEdit ? "บันทึกการแก้ไขข้อมูลและใบหน้าใหม่เรียบร้อยแล้ว" : "ระบบจำข้อมูลบนมือถือเครื่องนี้เรียบร้อยแล้ว พร้อมตรวจวัดแอลกอฮอล์ได้ทันที"}</p>
        `,
        confirmButtonColor: "#2563eb",
        confirmButtonText: "ไปยังหน้าตรวจวัดแอลกอฮอล์ทันที"
      }).then(() => {
        window.location.href = "index.html";
      });
    }

  } catch (error) {
    console.error("Registration Error:", error);
    Swal.fire({
      icon: "error",
      title: "เกิดข้อผิดพลาดในการบันทึก",
      text: error.message || "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้",
      confirmButtonColor: "#2563eb"
    });
  }
}
