/**
 * =========================================================================
 * Google Apps Script - ระบบตรวจวัดแอลกอฮอล์และสุขภาพ พนักงานขับรถขนส่ง
 * หจก. ทั่วไทยขนส่งมงคล (Mr.Taweesak.kom - 062-3285963)
 * 
 * Google Sheet ID: 1JM-i8_nrGR7-VDEY82QZ5l5JMJTIBOIsuqOSQSrcD3Y
 * Google Drive Folder ID: 1tfKH6EOBFdG0c4Wm2MPO-R61NP5mAc0c
 * =========================================================================
 */

var SPREADSHEET_ID = "1JM-i8_nrGR7-VDEY82QZ5l5JMJTIBOIsuqOSQSrcD3Y";
var DRIVE_FOLDER_ID = "1tfKH6EOBFdG0c4Wm2MPO-R61NP5mAc0c";

var SHEET_LOGS = "Alcohol_Logs";
var SHEET_DRIVERS = "Registered_Drivers";

// =========================================================================
// การตั้งค่าแจ้งเตือนหลังบ้าน (LINE & Telegram Notifications)
// =========================================================================
var NOTIFICATION_CONFIG = {
  // 1. Telegram Alert (แนะนำ - เสถียรและส่งรูปภาพเข้ากลุ่มได้ทันที)
  // วิธีสร้าง: ทัก @BotFather ใน Telegram แล้วพิมพ์ /newbot จะได้ TOKEN
  // จากนั้นดึง Chat ID ของกลุ่มหรือตนเองมาใส่
  TELEGRAM_BOT_TOKEN: "", // ใส่ Telegram Bot Token เช่น "7123456789:AAH..."
  TELEGRAM_CHAT_ID: "",   // ใส่ Chat ID เช่น "-1001234567890" หรือ "123456789"

  // 2. LINE Messaging API (Official modern LINE Bot)
  // Channel Access Token จาก LINE Developers Console
  LINE_CHANNEL_ACCESS_TOKEN: "", // ใส่ Channel Access Token
  LINE_TARGET_ID: "",           // ใส่ User ID หรือ Group ID (เช่น U123... หรือ C123...)

  // 3. LINE Notify (เดิม - ใช้ได้ถึง 31 มี.ค. 2025)
  LINE_NOTIFY_TOKEN: "", // ใส่ LINE Notify Token

  // แจ้งเตือนเฉพาะกรณีไม่ผ่าน หรือความดันสูง (true) หรือแจ้งทุกรายการ (false)
  ALERT_ON_FAIL_ONLY: false
};

/**
 * ฟังก์ชันเริ่มต้นสร้างตารางและหัวคอลัมน์อัตโนมัติ (รองรับการอัปเกรดตารางเดิม)
 */
function initialSetup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. ชีต Alcohol_Logs
  var logSheet = ss.getSheetByName(SHEET_LOGS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOGS);
  }
  
  var logHeaders = [
    "Timestamp",
    "Date",
    "Time",
    "Driver_ID",
    "Driver_Name",
    "Email",
    "Phone",
    "Vehicle_Plate",
    "Alcohol_Value",
    "Status",
    "BP_SYS",
    "BP_DIA",
    "BP_Pulse",
    "BP_Status",
    "Overall_Status",
    "Face_Match_Percent",
    "Report_Card_URL",
    "Face_Photo_URL",
    "Meter_Photo_URL",
    "BP_Photo_URL",
    "GPS_Coordinates",
    "Google_Maps_Link",
    "Verification_Method",
    "Remarks"
  ];
  
  ensureColumnsMatch(logSheet, logHeaders, "#1E3A8A");

  // 2. ชีต Registered_Drivers (ทะเบียนพนักงาน พร้อมรูปต้นแบบ 1:1)
  var driverSheet = ss.getSheetByName(SHEET_DRIVERS);
  if (!driverSheet) {
    driverSheet = ss.insertSheet(SHEET_DRIVERS);
  }
  
  var driverHeaders = [
    "Driver_ID",
    "Driver_Name",
    "Email",
    "Phone",
    "Vehicle_Plate",
    "Department",
    "Status",
    "Master_Face_URL",
    "Face_Descriptor_JSON",
    "Registered_Date"
  ];
  
  ensureColumnsMatch(driverSheet, driverHeaders, "#065F46");
  
  return "Setup & Column Migration Completed Successfully";
}

/**
 * ฟังก์ชันตรวจสอบและเพิ่มคอลัมน์ที่ขาดหายไปในชีตเดิม โดยไม่ลบข้อมูลเดิม
 */
function ensureColumnsMatch(sheet, requiredHeaders, headerBgColor) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(requiredHeaders);
    var range = sheet.getRange(1, 1, 1, requiredHeaders.length);
    range.setBackground(headerBgColor)
         .setFontColor("#FFFFFF")
         .setFontWeight("bold")
         .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    for (var i = 1; i <= requiredHeaders.length; i++) {
      sheet.setColumnWidth(i, 150);
    }
    return;
  }

  // กรณีมีหัวตารางอยู่แล้ว ให้ตรวจสอบคอลัมน์ที่ยังไม่มีแล้วเพิ่มต่อท้าย
  var lastCol = Math.max(1, sheet.getLastColumn());
  var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var currentHeaderMap = {};
  for (var c = 0; c < currentHeaders.length; c++) {
    currentHeaderMap[currentHeaders[c].toString().trim()] = c + 1;
  }

  for (var r = 0; r < requiredHeaders.length; r++) {
    var reqName = requiredHeaders[r];
    if (!currentHeaderMap[reqName]) {
      var newColIdx = sheet.getLastColumn() + 1;
      sheet.insertColumnAfter(sheet.getLastColumn());
      var cell = sheet.getRange(1, newColIdx);
      cell.setValue(reqName)
          .setBackground(headerBgColor)
          .setFontColor("#FFFFFF")
          .setFontWeight("bold")
          .setHorizontalAlignment("center");
      sheet.setColumnWidth(newColIdx, 160);
      currentHeaderMap[reqName] = newColIdx;
    }
  }
}

/**
 * คืนค่า Map ตำแหน่งคอลัมน์ตามชื่อ Header
 */
function getColumnIndexMap(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i].toString().trim();
    if (key) {
      map[key] = i + 1; // 1-based column index
    }
  }
  return map;
}

/**
 * จัดการคำขอแบบ GET
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
  
  if (action === "setup") {
    var setupResult = initialSetup();
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: setupResult
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "checkEmail") {
    var email = (e.parameter.email || "").trim().toLowerCase();
    var driver = findDriverByEmail(email);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: driver !== null,
      driver: driver,
      message: driver ? "พบข้อมูลพนักงานในระบบ" : "ไม่พบอีเมลนี้ในระบบทะเบียนพนักงาน"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "listDrivers") {
    var drivers = getAllDrivers();
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      drivers: drivers
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    system: "ระบบตรวจวัดแอลกอฮอล์และความพร้อมพนักงาน หจก. ทั่วไทยขนส่งมงคล",
    owner: "Mr.Taweesak.kom (062-3285963)",
    status: "Service is online"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ค้นหาข้อมูลพนักงานจาก Email (ค้นหาตามชื่อ Header คอลัมน์)
 */
function findDriverByEmail(email) {
  if (!email) return null;
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_DRIVERS);
    if (!sheet) {
      initialSetup();
      sheet = ss.getSheetByName(SHEET_DRIVERS);
    }
    
    initialSetup(); // อัปเกรดคอลัมน์เสมอ
    var colMap = getColumnIndexMap(sheet);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return null;
    
    var emailColIdx = (colMap["Email"] || 3) - 1;
    
    for (var i = 1; i < data.length; i++) {
      var rowEmail = (data[i][emailColIdx] || "").toString().trim().toLowerCase();
      if (rowEmail === email) {
        return {
          driverId: data[i][(colMap["Driver_ID"] || 1) - 1] || "",
          driverName: data[i][(colMap["Driver_Name"] || 2) - 1] || "",
          email: data[i][(colMap["Email"] || 3) - 1] || "",
          phone: data[i][(colMap["Phone"] || 4) - 1] || "",
          vehiclePlate: data[i][(colMap["Vehicle_Plate"] || 5) - 1] || "",
          department: data[i][(colMap["Department"] || 6) - 1] || "",
          status: data[i][(colMap["Status"] || 7) - 1] || "ACTIVE",
          masterFaceUrl: colMap["Master_Face_URL"] ? (data[i][colMap["Master_Face_URL"] - 1] || "") : "",
          faceDescriptor: colMap["Face_Descriptor_JSON"] ? (data[i][colMap["Face_Descriptor_JSON"] - 1] || "") : "",
          registeredDate: colMap["Registered_Date"] ? (data[i][colMap["Registered_Date"] - 1] || "") : ""
        };
      }
    }
    return null;
  } catch (err) {
    Logger.log("Error finding driver: " + err.message);
    return null;
  }
}

/**
 * ดึงรายชื่อพนักงานทั้งหมด
 */
function getAllDrivers() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_DRIVERS);
    if (!sheet) return [];
    
    var colMap = getColumnIndexMap(sheet);
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      list.push({
        driverId: data[i][(colMap["Driver_ID"] || 1) - 1],
        driverName: data[i][(colMap["Driver_Name"] || 2) - 1],
        email: data[i][(colMap["Email"] || 3) - 1],
        phone: data[i][(colMap["Phone"] || 4) - 1],
        vehiclePlate: data[i][(colMap["Vehicle_Plate"] || 5) - 1],
        department: data[i][(colMap["Department"] || 6) - 1],
        hasMasterFace: colMap["Master_Face_URL"] ? !!data[i][colMap["Master_Face_URL"] - 1] : false,
        status: data[i][(colMap["Status"] || 7) - 1]
      });
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * จัดการคำขอแบบ POST (ลงทะเบียนพนักงาน & บันทึกผลตรวจวัดแอลกอฮอล์ + ความดัน)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);
  
  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);
    var action = payload.action || "submitAlcoholTest";
    
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var now = new Date();
    
    // -------------------------------------------------------------
    // ACTION 1: ลงทะเบียนพนักงานใหม่ / อัปเดตรูปหน้าต้นแบบ (Register Master Face)
    // -------------------------------------------------------------
    if (action === "registerDriver") {
      var driverSheet = ss.getSheetByName(SHEET_DRIVERS);
      if (!driverSheet) {
        initialSetup();
        driverSheet = ss.getSheetByName(SHEET_DRIVERS);
      }
      
      initialSetup(); // รับประกันว่ามีคอลัมน์ครบ
      var colMap = getColumnIndexMap(driverSheet);
      
      var regDriverId = payload.driverId || ("DRV-" + Math.floor(100 + Math.random() * 900));
      var regName = payload.driverName || "ไม่ระบุชื่อ";
      var regEmail = (payload.email || "").trim().toLowerCase();
      var regPhone = payload.phone || "-";
      var regPlate = payload.vehiclePlate || "-";
      var regDept = payload.department || "แผนกขนส่ง";
      var descriptorJson = payload.faceDescriptorJson || "";
      var dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
      
      // บันทึกรูปหน้าต้นแบบ (Master Face) ลง Google Drive
      var masterFaceUrl = "";
      if (payload.masterFaceImageBase64) {
        var masterFileName = "MASTER_FACE_" + regDriverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
        var masterFile = saveBase64ToDrive(payload.masterFaceImageBase64, masterFileName, folder);
        masterFaceUrl = masterFile.getUrl();
      }
      
      // ตรวจสอบว่ามีอีเมลนี้อยู่แล้วหรือไม่
      var emailColIdx = (colMap["Email"] || 3) - 1;
      var driverData = driverSheet.getDataRange().getValues();
      var targetRow = -1;
      for (var k = 1; k < driverData.length; k++) {
        if ((driverData[k][emailColIdx] || "").toString().trim().toLowerCase() === regEmail) {
          targetRow = k + 1; // 1-based row index
          break;
        }
      }
      
      if (targetRow > 0) {
        // อัปเดตแถวเดิมตามชื่อคอลัมน์
        if (colMap["Driver_ID"]) driverSheet.getRange(targetRow, colMap["Driver_ID"]).setValue(regDriverId);
        if (colMap["Driver_Name"]) driverSheet.getRange(targetRow, colMap["Driver_Name"]).setValue(regName);
        if (colMap["Phone"]) driverSheet.getRange(targetRow, colMap["Phone"]).setValue(regPhone);
        if (colMap["Vehicle_Plate"]) driverSheet.getRange(targetRow, colMap["Vehicle_Plate"]).setValue(regPlate);
        if (colMap["Department"]) driverSheet.getRange(targetRow, colMap["Department"]).setValue(regDept);
        if (colMap["Status"]) driverSheet.getRange(targetRow, colMap["Status"]).setValue("ACTIVE");
        if (colMap["Master_Face_URL"] && masterFaceUrl) driverSheet.getRange(targetRow, colMap["Master_Face_URL"]).setValue(masterFaceUrl);
        if (colMap["Face_Descriptor_JSON"] && descriptorJson) driverSheet.getRange(targetRow, colMap["Face_Descriptor_JSON"]).setValue(descriptorJson);
        if (colMap["Registered_Date"]) driverSheet.getRange(targetRow, colMap["Registered_Date"]).setValue(dateStr);
      } else {
        // เพิ่มแถวใหม่
        var newRow = [];
        var maxCol = driverSheet.getLastColumn();
        for (var c = 1; c <= maxCol; c++) newRow.push("");
        
        if (colMap["Driver_ID"]) newRow[colMap["Driver_ID"] - 1] = regDriverId;
        if (colMap["Driver_Name"]) newRow[colMap["Driver_Name"] - 1] = regName;
        if (colMap["Email"]) newRow[colMap["Email"] - 1] = regEmail;
        if (colMap["Phone"]) newRow[colMap["Phone"] - 1] = regPhone;
        if (colMap["Vehicle_Plate"]) newRow[colMap["Vehicle_Plate"] - 1] = regPlate;
        if (colMap["Department"]) newRow[colMap["Department"] - 1] = regDept;
        if (colMap["Status"]) newRow[colMap["Status"] - 1] = "ACTIVE";
        if (colMap["Master_Face_URL"]) newRow[colMap["Master_Face_URL"] - 1] = masterFaceUrl;
        if (colMap["Face_Descriptor_JSON"]) newRow[colMap["Face_Descriptor_JSON"] - 1] = descriptorJson;
        if (colMap["Registered_Date"]) newRow[colMap["Registered_Date"] - 1] = dateStr;
        
        driverSheet.appendRow(newRow);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "ลงทะเบียนพนักงานและบันทึกใบหน้าต้นแบบลง Google Drive สำเร็จ",
        driverId: regDriverId,
        masterFaceUrl: masterFaceUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // -------------------------------------------------------------
    // ACTION 2: บันทึกผลตรวจวัดแอลกอฮอล์ + ความดันโลหิต (Submit Alcohol & BP Test)
    // -------------------------------------------------------------
    var logSheet = ss.getSheetByName(SHEET_LOGS);
    if (!logSheet) {
      initialSetup();
      logSheet = ss.getSheetByName(SHEET_LOGS);
    }
    
    initialSetup(); // อัปเกรดคอลัมน์อัตโนมัติ
    var logColMap = getColumnIndexMap(logSheet);
    
    var logDate = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
    var logTime = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm:ss");
    var fullTimestamp = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
    
    var driverId = payload.driverId || "UNKNOWN";
    var driverName = payload.driverName || "ไม่ระบุชื่อ";
    var email = (payload.email || "").trim();
    var phone = payload.phone || "-";
    var vehiclePlate = payload.vehiclePlate || "-";
    var alcoholVal = parseFloat(payload.alcoholValue || 0).toFixed(2);
    var alcoholStatus = payload.status || (parseFloat(alcoholVal) < 0.01 ? "ผ่าน" : "ไม่ผ่าน");
    
    // ข้อมูลความดันโลหิตและชีพจร (Blood Pressure & Pulse)
    var bpSys = payload.bpSys ? parseInt(payload.bpSys) : 120;
    var bpDia = payload.bpDia ? parseInt(payload.bpDia) : 80;
    var bpPulse = payload.bpPulse ? parseInt(payload.bpPulse) : 75;
    var bpStatus = payload.bpStatus || (bpSys < 140 && bpDia < 90 ? "ความดันปกติ" : "ความดันสูง");
    var overallStatus = (alcoholStatus === "ผ่าน" && bpStatus === "ความดันปกติ") ? "ผ่านพร้อมปฏิบัติงาน" : "ไม่ผ่านเกณฑ์";
    
    var matchPercent = payload.faceMatchPercent || "-";
    var lat = payload.latitude || "";
    var lng = payload.longitude || "";
    var gps = (lat && lng) ? (lat + ", " + lng) : "-";
    var mapsUrl = (lat && lng) ? ("https://maps.google.com/?q=" + lat + "," + lng) : "-";
    var method = payload.verificationMethod || "Face 1:1 Matching & AI OCR";
    var remarks = payload.remarks || "-";

    // 1. จัดเก็บภาพรายงานสรุปรวม (Composite Report Card Image)
    var reportPhotoUrl = "-";
    if (payload.reportImageBase64) {
      var reportFileName = "REPORT_" + driverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
      var reportFile = saveBase64ToDrive(payload.reportImageBase64, reportFileName, folder);
      reportPhotoUrl = reportFile.getUrl();
    }

    // 2. จัดเก็บภาพถ่ายใบหน้า Check-in
    var facePhotoUrl = "-";
    if (payload.faceImageBase64) {
      var faceFileName = "FACE_" + driverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
      var faceFile = saveBase64ToDrive(payload.faceImageBase64, faceFileName, folder);
      facePhotoUrl = faceFile.getUrl();
    }
    
    // 3. จัดเก็บภาพหน้าปัดเครื่องเป่า
    var meterPhotoUrl = "-";
    if (payload.meterImageBase64) {
      var meterFileName = "METER_" + driverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
      var meterFile = saveBase64ToDrive(payload.meterImageBase64, meterFileName, folder);
      meterPhotoUrl = meterFile.getUrl();
    }

    // 4. จัดเก็บภาพหน้าปัดเครื่องวัดความดัน
    var bpPhotoUrl = "-";
    if (payload.bpPhotoBase64) {
      var bpFileName = "BP_" + driverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
      var bpFile = saveBase64ToDrive(payload.bpPhotoBase64, bpFileName, folder);
      bpPhotoUrl = bpFile.getUrl();
    }

    // สร้างแถวข้อมูลตามตำแหน่งคอลัมน์จริงใน Google Sheet
    var logMaxCol = logSheet.getLastColumn();
    var logRow = [];
    for (var m = 1; m <= logMaxCol; m++) logRow.push("");

    if (logColMap["Timestamp"]) logRow[logColMap["Timestamp"] - 1] = fullTimestamp;
    if (logColMap["Date"]) logRow[logColMap["Date"] - 1] = logDate;
    if (logColMap["Time"]) logRow[logColMap["Time"] - 1] = logTime;
    if (logColMap["Driver_ID"]) logRow[logColMap["Driver_ID"] - 1] = driverId;
    if (logColMap["Driver_Name"]) logRow[logColMap["Driver_Name"] - 1] = driverName;
    if (logColMap["Email"]) logRow[logColMap["Email"] - 1] = email;
    if (logColMap["Phone"]) logRow[logColMap["Phone"] - 1] = phone;
    if (logColMap["Vehicle_Plate"]) logRow[logColMap["Vehicle_Plate"] - 1] = vehiclePlate;
    if (logColMap["Alcohol_Value"]) logRow[logColMap["Alcohol_Value"] - 1] = alcoholVal;
    if (logColMap["Status"]) logRow[logColMap["Status"] - 1] = alcoholStatus;
    if (logColMap["BP_SYS"]) logRow[logColMap["BP_SYS"] - 1] = bpSys;
    if (logColMap["BP_DIA"]) logRow[logColMap["BP_DIA"] - 1] = bpDia;
    if (logColMap["BP_Pulse"]) logRow[logColMap["BP_Pulse"] - 1] = bpPulse;
    if (logColMap["BP_Status"]) logRow[logColMap["BP_Status"] - 1] = bpStatus;
    if (logColMap["Overall_Status"]) logRow[logColMap["Overall_Status"] - 1] = overallStatus;
    if (logColMap["Face_Match_Percent"]) logRow[logColMap["Face_Match_Percent"] - 1] = matchPercent;
    if (logColMap["Report_Card_URL"]) logRow[logColMap["Report_Card_URL"] - 1] = reportPhotoUrl;
    if (logColMap["Face_Photo_URL"]) logRow[logColMap["Face_Photo_URL"] - 1] = facePhotoUrl;
    if (logColMap["Meter_Photo_URL"]) logRow[logColMap["Meter_Photo_URL"] - 1] = meterPhotoUrl;
    if (logColMap["BP_Photo_URL"]) logRow[logColMap["BP_Photo_URL"] - 1] = bpPhotoUrl;
    if (logColMap["GPS_Coordinates"]) logRow[logColMap["GPS_Coordinates"] - 1] = gps;
    if (logColMap["Google_Maps_Link"]) logRow[logColMap["Google_Maps_Link"] - 1] = mapsUrl;
    if (logColMap["Verification_Method"]) logRow[logColMap["Verification_Method"] - 1] = method;
    if (logColMap["Remarks"]) logRow[logColMap["Remarks"] - 1] = remarks;

    logSheet.appendRow(logRow);
    
    var lastRow = logSheet.getLastRow();
    if (overallStatus !== "ผ่านพร้อมปฏิบัติงาน") {
      logSheet.getRange(lastRow, 1, 1, logMaxCol).setBackground("#FEE2E2"); // สีแดงอ่อน
    } else {
      logSheet.getRange(lastRow, 1, 1, logMaxCol).setBackground("#ECFDF5"); // สีเขียวอ่อน
    }
    
    // ส่งการแจ้งเตือนไปยัง LINE และ Telegram หลังบ้าน
    var alertText = "📋 [รายงานตรวจวัดพนักงานขับรถขนส่ง]\n" +
                    "🏢 หจก. ทั่วไทยขนส่งมงคล\n" +
                    "👤 พนักงาน: " + driverName + " (" + driverId + ")\n" +
                    "🚚 ทะเบียน: " + vehiclePlate + "\n" +
                    "🍺 แอลกอฮอล์: " + alcoholVal + " mg% (" + alcoholStatus + ")\n" +
                    "💓 ความดัน: " + bpSys + "/" + bpDia + " mmHg (ชีพจร " + bpPulse + " bpm) • " + bpStatus + "\n" +
                    "🎯 สรุปผล: " + overallStatus + "\n" +
                    "📍 พิกัด GPS: " + gps + "\n" +
                    "⏰ เวลา: " + fullTimestamp + "\n" +
                    (reportPhotoUrl !== "-" ? "🖼️ รูปรายงาน: " + reportPhotoUrl : "");

    var isUrgentAlert = (overallStatus !== "ผ่านพร้อมปฏิบัติงาน");
    if (!NOTIFICATION_CONFIG.ALERT_ON_FAIL_ONLY || isUrgentAlert) {
      try {
        sendTelegramAlert(alertText, reportPhotoUrl !== "-" ? reportPhotoUrl : null);
      } catch (tgErr) {
        Logger.log("Telegram alert error: " + tgErr.message);
      }

      try {
        sendLineAlert(alertText);
      } catch (lineErr) {
        Logger.log("LINE alert error: " + lineErr.message);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "บันทึกผลตรวจและจัดเก็บรูปภาพรายงานลง Google Drive สำเร็จ",
      timestamp: fullTimestamp,
      status: alcoholStatus,
      alcoholValue: alcoholVal,
      bpStatus: bpStatus,
      overallStatus: overallStatus,
      faceMatchPercent: matchPercent,
      reportPhotoUrl: reportPhotoUrl,
      facePhotoUrl: facePhotoUrl,
      meterPhotoUrl: meterPhotoUrl,
      bpPhotoUrl: bpPhotoUrl
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    Logger.log("Error doPost: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * ส่งข้อความแจ้งเตือนผ่าน Telegram Bot
 */
function sendTelegramAlert(message, photoUrl) {
  var botToken = NOTIFICATION_CONFIG.TELEGRAM_BOT_TOKEN;
  var chatId = NOTIFICATION_CONFIG.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML"
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/**
 * ส่งข้อความแจ้งเตือนผ่าน LINE Messaging API หรือ LINE Notify
 */
function sendLineAlert(message) {
  // 1. LINE Messaging API
  if (NOTIFICATION_CONFIG.LINE_CHANNEL_ACCESS_TOKEN && NOTIFICATION_CONFIG.LINE_TARGET_ID) {
    var pushUrl = "https://api.line.me/v2/bot/message/push";
    var pushPayload = {
      to: NOTIFICATION_CONFIG.LINE_TARGET_ID,
      messages: [{ type: "text", text: message }]
    };
    UrlFetchApp.fetch(pushUrl, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + NOTIFICATION_CONFIG.LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(pushPayload),
      muteHttpExceptions: true
    });
    return;
  }

  // 2. LINE Notify (Fallback)
  if (NOTIFICATION_CONFIG.LINE_NOTIFY_TOKEN) {
    var notifyUrl = "https://notify-api.line.me/api/notify";
    UrlFetchApp.fetch(notifyUrl, {
      method: "post",
      headers: {
        "Authorization": "Bearer " + NOTIFICATION_CONFIG.LINE_NOTIFY_TOKEN
      },
      payload: { message: message },
      muteHttpExceptions: true
    });
  }
}

/**
 * ฟังก์ชันบันทึก Base64 Image ลงใน Google Drive
 */
function saveBase64ToDrive(base64Data, filename, folder) {
  var cleanBase64 = base64Data;
  var mimeType = "image/jpeg";
  
  if (base64Data.indexOf("data:") === 0) {
    var parts = base64Data.split(",");
    var mimeMatch = parts[0].match(/:(.*?);/);
    if (mimeMatch && mimeMatch[1]) {
      mimeType = mimeMatch[1];
    }
    cleanBase64 = parts[1];
  }
  
  var decoded = Utilities.base64Decode(cleanBase64);
  var blob = Utilities.newBlob(decoded, mimeType, filename);
  var file = folder.createFile(blob);
  
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {
    Logger.log("Sharing error: " + e.message);
  }
  
  return file;
}
