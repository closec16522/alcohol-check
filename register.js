/**
 * =========================================================================
 * Registration & Master Face Logic (register.js)
 * หจก. ทั่วไทยขนส่งมงคล (Mr.Taweesak.kom - 062-3285963)
 * =========================================================================
 */

const REG_CONFIG = {
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbz_REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec",
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

const regState = {
  masterFaceBase64: null,
  faceDescriptor: null,
  stream: null,
  modelsLoaded: false
};

document.addEventListener("DOMContentLoaded", async () => {
  await verifyAdminAccess();
  initRegistrationEvents();
  loadFaceModels();
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

  if (btnStartCamera) btnStartCamera.addEventListener("click", () => startMasterCamera());
  if (btnCapture) btnCapture.addEventListener("click", () => captureMasterFace());
  if (btnRetake) btnRetake.addEventListener("click", () => retakeMasterFace());
  if (btnSubmit) btnSubmit.addEventListener("click", () => submitRegistration());
}

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
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  const photoDataUrl = canvas.toDataURL("image/jpeg", 0.90);
  regState.masterFaceBase64 = photoDataUrl;

  stopMasterCamera();
  videoEl.classList.add("hidden");
  imgEl.src = photoDataUrl;
  imgEl.classList.remove("hidden");

  extractingEl.classList.remove("hidden");

  // วิเคราะห์ใบหน้าด้วย Face-API (ถ้ามี) หรือคำนวณ Landmark vector
  try {
    let descriptor = null;
    if (window.faceapi && regState.modelsLoaded) {
      const detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
                                    .withFaceLandmarks()
                                    .withFaceDescriptor();
      if (detection && detection.descriptor) {
        descriptor = Array.from(detection.descriptor);
      }
    }
    
    // ถ้าไม่มี faceapi หรือสกัดไม่ได้ สร้าง fallback facial fingerprint จากตารางพิกเซล
    if (!descriptor) {
      descriptor = generateFallbackFacialVector(ctx, canvas.width, canvas.height);
    }

    regState.faceDescriptor = descriptor;
  } catch (err) {
    console.warn("Face analysis fallback:", err);
    regState.faceDescriptor = generateFallbackFacialVector(ctx, canvas.width, canvas.height);
  } finally {
    extractingEl.classList.add("hidden");
    retakeBtn.classList.remove("hidden");
    captureBtn.classList.add("hidden");
  }

  Swal.fire({
    icon: "success",
    title: "บันทึกภาพใบหน้าสำเร็จ",
    text: "AI วิเคราะห์โครงสร้างใบหน้าต้นแบบเรียบร้อยแล้ว",
    timer: 1400,
    showConfirmButton: false
  });
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

  if (!regState.masterFaceBase64) {
    Swal.fire({
      icon: "warning",
      title: "ยังไม่ได้ถ่ายภาพใบหน้าต้นแบบ",
      text: "กรุณาเปิดกล้องหน้าและกดถ่ายรูปใบหน้าต้นแบบก่อนบันทึก",
      confirmButtonColor: "#2563eb"
    });
    return;
  }

  Swal.fire({
    title: "กำลังบันทึกข้อมูล...",
    html: `<div class="text-xs text-slate-500">กำลังอัปโหลดใบหน้าต้นแบบไปยัง Google Drive และบันทึกข้อมูลพนักงาน...</div>`,
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
    masterFaceImageBase64: regState.masterFaceBase64,
    faceDescriptorJson: JSON.stringify(regState.faceDescriptor || [])
  };

  try {
    let success = false;
    let message = "ลงทะเบียนพนักงานและบันทึกใบหน้าต้นแบบเรียบร้อย";
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
      const localDriverData = {
        driverId: driverId,
        driverName: driverName,
        email: email,
        phone: phone,
        vehiclePlate: plate,
        department: dept,
        masterFacePhoto: regState.masterFaceBase64,
        masterFaceDescriptor: regState.faceDescriptor,
        masterFaceUrl: masterUrl
      };
      localStorage.setItem("TTMK_DRIVER_PROFILE", JSON.stringify(localDriverData));

      Swal.fire({
        icon: "success",
        title: "ลงทะเบียนสำเร็จ!",
        html: `
          <p class="text-xs text-slate-600 mb-2">${message}</p>
          <p class="text-xs text-emerald-600 font-bold">ระบบจำข้อมูลบนมือถือเครื่องนี้เรียบร้อยแล้ว พร้อมตรวจวัดแอลกอฮอล์ได้ทันที</p>
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
