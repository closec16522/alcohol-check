/**
 * =========================================================================
 * Google Apps Script - ระบบตรวจวัดแอลกอฮอล์ พนักงานขับรถขนส่ง
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

/**
 * ฟังก์ชันเริ่มต้นสร้างตารางและหัวคอลัมน์อัตโนมัติ
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
    "Face_Match_Percent",
    "Face_Photo_URL",
    "Meter_Photo_URL",
    "GPS_Coordinates",
    "Google_Maps_Link",
    "Verification_Method",
    "Remarks"
  ];
  
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(logHeaders);
    var headerRange = logSheet.getRange(1, 1, 1, logHeaders.length);
    headerRange.setBackground("#1E3A8A")
               .setFontColor("#FFFFFF")
               .setFontWeight("bold")
               .setHorizontalAlignment("center");
    logSheet.setFrozenRows(1);
    for (var i = 1; i <= logHeaders.length; i++) {
      logSheet.setColumnWidth(i, 150);
    }
  }

  // 2. ชีต Registered_Drivers (ทะเบียนพนักงาน พร้อมข้อมูลใบหน้าต้นแบบ 1:1)
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
    "Master_Face_URL",
    "Face_Descriptor_JSON",
    "Registered_Date",
    "Status"
  ];
  
  if (driverSheet.getLastRow() === 0) {
    driverSheet.appendRow(driverHeaders);
    var driverHeaderRange = driverSheet.getRange(1, 1, 1, driverHeaders.length);
    driverHeaderRange.setBackground("#065F46")
                     .setFontColor("#FFFFFF")
                     .setFontWeight("bold")
                     .setHorizontalAlignment("center");
    driverSheet.setFrozenRows(1);

    // ตัวอย่างข้อมูลเริ่มต้น
    driverSheet.appendRow([
      "DRV-001",
      "นายทวีศักดิ์ คมสัน (Mr.Taweesak)",
      "taweesak.kom@gmail.com",
      "062-3285963",
      "70-8899 กทม.",
      "แผนกขนส่งด่วนพิเศษ",
      "",
      "",
      Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss"),
      "ACTIVE"
    ]);
    driverSheet.appendRow([
      "DRV-002",
      "นายทวีศักดิ์ (closec16522)",
      "closec16522@gmail.com",
      "062-3285963",
      "70-9988 กทม.",
      "แผนกขนส่งด่วนพิเศษ",
      "",
      "",
      Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss"),
      "ACTIVE"
    ]);
    
    for (var j = 1; j <= driverHeaders.length; j++) {
      driverSheet.setColumnWidth(j, 160);
    }
  }
  
  return "Setup Completed Successfully";
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
    system: "ระบบตรวจวัดแอลกอฮอล์ หจก. ทั่วไทยขนส่งมงคล",
    owner: "Mr.Taweesak.kom (062-3285963)",
    status: "Service is online"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ค้นหาข้อมูลพนักงานจาก Email
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
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return null;
    
    for (var i = 1; i < data.length; i++) {
      var rowEmail = (data[i][2] || "").toString().trim().toLowerCase();
      if (rowEmail === email) {
        return {
          driverId: data[i][0],
          driverName: data[i][1],
          email: data[i][2],
          phone: data[i][3],
          vehiclePlate: data[i][4],
          department: data[i][5],
          masterFaceUrl: data[i][6] || "",
          faceDescriptor: data[i][7] || "",
          registeredDate: data[i][8] || "",
          status: data[i][9] || "ACTIVE"
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
    
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      list.push({
        driverId: data[i][0],
        driverName: data[i][1],
        email: data[i][2],
        phone: data[i][3],
        vehiclePlate: data[i][4],
        department: data[i][5],
        hasMasterFace: !!data[i][6],
        status: data[i][9]
      });
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * จัดการคำขอแบบ POST (ลงทะเบียนพนักงานใหม่ & บันทึกผลตรวจวัดแอลกอฮอล์)
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
        var masterFileName = "MASTER_FACE_" + regDriverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd") + ".jpg";
        var masterFile = saveBase64ToDrive(payload.masterFaceImageBase64, masterFileName, folder);
        masterFaceUrl = masterFile.getUrl();
      }
      
      // ค้นหาว่ามีอีเมลนี้อยู่แล้วหรือไม่ (ถ้ามีให้อัปเดต ถ้าไม่มีให้เพิ่มใหม่)
      var driverData = driverSheet.getDataRange().getValues();
      var existingRowIndex = -1;
      for (var k = 1; k < driverData.length; k++) {
        if ((driverData[k][2] || "").toString().trim().toLowerCase() === regEmail) {
          existingRowIndex = k + 1; // 1-based row index in sheet
          break;
        }
      }
      
      if (existingRowIndex > 0) {
        // อัปเดตข้อมูลแถวเดิม
        driverSheet.getRange(existingRowIndex, 1, 1, 10).setValues([[
          regDriverId,
          regName,
          regEmail,
          regPhone,
          regPlate,
          regDept,
          masterFaceUrl || driverData[existingRowIndex - 1][6],
          descriptorJson || driverData[existingRowIndex - 1][7],
          dateStr,
          "ACTIVE"
        ]]);
      } else {
        // เพิ่มแถวพนักงานใหม่
        driverSheet.appendRow([
          regDriverId,
          regName,
          regEmail,
          regPhone,
          regPlate,
          regDept,
          masterFaceUrl,
          descriptorJson,
          dateStr,
          "ACTIVE"
        ]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "ลงทะเบียนพนักงานและบันทึกใบหน้าต้นแบบสำเร็จ",
        driverId: regDriverId,
        masterFaceUrl: masterFaceUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // -------------------------------------------------------------
    // ACTION 2: บันทึกผลการตรวจวัดแอลกอฮอล์ประจำวัน (Submit Alcohol Test)
    // -------------------------------------------------------------
    var logSheet = ss.getSheetByName(SHEET_LOGS);
    if (!logSheet) {
      initialSetup();
      logSheet = ss.getSheetByName(SHEET_LOGS);
    }
    
    var logDate = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
    var logTime = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm:ss");
    var fullTimestamp = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
    
    var driverId = payload.driverId || "UNKNOWN";
    var driverName = payload.driverName || "ไม่ระบุชื่อ";
    var email = (payload.email || "").trim();
    var phone = payload.phone || "-";
    var vehiclePlate = payload.vehiclePlate || "-";
    var alcoholVal = parseFloat(payload.alcoholValue || 0).toFixed(2);
    // เกณฑ์ความปลอดภัย: หากระดับแอลกอฮอล์ตั้งแต่ 0.01 mg% ขึ้นไป = ไม่ผ่านทันที
    var status = payload.status || (parseFloat(alcoholVal) < 0.01 ? "ผ่าน" : "ไม่ผ่าน");
    var matchPercent = payload.faceMatchPercent || "-";
    var lat = payload.latitude || "";
    var lng = payload.longitude || "";
    var gps = (lat && lng) ? (lat + ", " + lng) : "-";
    var mapsUrl = (lat && lng) ? ("https://maps.google.com/?q=" + lat + "," + lng) : "-";
    var method = payload.verificationMethod || "Face 1:1 Matching & AI OCR";
    var remarks = payload.remarks || "-";

    // จัดเก็บภาพลง Google Drive
    var facePhotoUrl = "-";
    if (payload.faceImageBase64) {
      var faceFileName = "FACE_" + driverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
      var faceFile = saveBase64ToDrive(payload.faceImageBase64, faceFileName, folder);
      facePhotoUrl = faceFile.getUrl();
    }
    
    var meterPhotoUrl = "-";
    if (payload.meterImageBase64) {
      var meterFileName = "METER_" + driverId + "_" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".jpg";
      var meterFile = saveBase64ToDrive(payload.meterImageBase64, meterFileName, folder);
      meterPhotoUrl = meterFile.getUrl();
    }
    
    // เพิ่มแถวบันทึกลง Sheet
    logSheet.appendRow([
      fullTimestamp,
      logDate,
      logTime,
      driverId,
      driverName,
      email,
      phone,
      vehiclePlate,
      alcoholVal,
      status,
      matchPercent,
      facePhotoUrl,
      meterPhotoUrl,
      gps,
      mapsUrl,
      method,
      remarks
    ]);
    
    var lastRow = logSheet.getLastRow();
    if (status === "ไม่ผ่าน" || parseFloat(alcoholVal) >= 0.01) {
      logSheet.getRange(lastRow, 1, 1, 17).setBackground("#FEE2E2"); // สีแดงอ่อน
    } else {
      logSheet.getRange(lastRow, 1, 1, 17).setBackground("#ECFDF5"); // สีเขียวอ่อน
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "บันทึกผลตรวจและรูปภาพสำเร็จ",
      timestamp: fullTimestamp,
      status: status,
      alcoholValue: alcoholVal,
      faceMatchPercent: matchPercent,
      facePhotoUrl: facePhotoUrl,
      meterPhotoUrl: meterPhotoUrl
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
