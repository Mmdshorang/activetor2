import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx"; // فرض می‌کنیم XLSX از قبل نصب شده است (npm install xlsx)
import api from "../services/api";

// فرض می‌کنیم تابع fetch برای ارسال درخواست به API در دسترس است
// اگر از کتابخانه‌ای مانند axios استفاده می‌کنید، آن را import کنید

const ExcelUploader = ({ dbFields, onDataUpload, onClose }) => {
  const [file, setFile] = useState(null);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadedCustomers, setUploadedCustomers] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);

  // --- بخش انتخاب فایل ---
  const onDrop = useCallback((acceptedFiles) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const binaryString = e.target.result;
      try {
        const workbook = XLSX.read(binaryString, { type: "binary" });
        const sheetName = workbook.SheetNames[0]; // فرض می‌کنیم اولین شیت را می‌خوانیم
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // header: 1 برای دریافت سطر اول به عنوان هدر

        if (data.length > 0) {
          setExcelHeaders(data[0]); // سطر اول به عنوان هدرها
          setFieldMapping({}); // ریست کردن نگاشت فیلدها برای فایل جدید
          setFile(acceptedFiles[0]); // ذخیره فایل پذیرفته شده
          setUploadStatus("");
          setUploadedCustomers([]); // ریست کردن نتایج بارگذاری قبلی
          setUploadErrors([]); // ریست کردن خطاهای قبلی
        } else {
          setExcelHeaders([]);
          setFieldMapping({});
          setFile(null);
          setUploadStatus("فایل اکسل انتخابی خالی است.");
          setUploadedCustomers([]);
          setUploadErrors([]);
        }
      } catch (error) {
        console.error("Error reading Excel file:", error);
        setUploadStatus(
          "خطا در خواندن فایل اکسل. لطفاً از فرمت صحیح (.xlsx, .xls) استفاده کنید.",
        );
        setExcelHeaders([]);
        setFieldMapping({});
        setFile(null);
        setUploadedCustomers([]);
        setUploadErrors([]);
      }
    };
    reader.onerror = (error) => {
      console.error("File reading error:", error);
      setUploadStatus("خطا در دسترسی به فایل.");
    };
    reader.readAsBinaryString(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ".xlsx, .xls", // فقط فایل‌های اکسل را قبول کن
  });

  // --- بخش نگاشت فیلدها ---
  const handleFieldChange = (excelHeader, dbField) => {
    setFieldMapping((prevMapping) => ({
      ...prevMapping,
      [excelHeader]: dbField,
    }));
  };

  // --- بخش ارسال داده‌ها ---
  const handleUpload = async () => {
    if (!file || excelHeaders.length === 0) {
      setUploadStatus("لطفاً ابتدا فایل اکسل را انتخاب کنید.");
      return;
    }
    if (Object.keys(fieldMapping).length === 0) {
      // بررسی می‌کنیم که آیا حداقل یک نگاشت انجام شده است یا فیلدی برای نگاشت وجود دارد
      // اگر dbFields خالی باشد یا هیچ نگاشتی انتخاب نشده باشد، این شرط ممکن است فعال شود
      const hasValidMapping = Object.values(fieldMapping).some(
        (field) => field && field !== "ignore",
      );
      if (!hasValidMapping && excelHeaders.length > 0) {
        setUploadStatus(
          "لطفاً فیلدهای اکسل را با فیلدهای پایگاه داده نگاشت کنید.",
        );
        return;
      }
    }

    setUploadStatus("در حال بارگذاری...");
    setUploadedCustomers([]);
    setUploadErrors([]);

    // خواندن مجدد داده‌ها برای ارسال به بک‌اند (این بار به صورت JSON objects)
    const reader = new FileReader();
    reader.onload = async (e) => {
      const binaryString = e.target.result;
      try {
        const workbook = XLSX.read(binaryString, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // تبدیل jsonData با استفاده از fieldMapping
        const processedData = jsonData.map((row) => {
          const mappedRow = {};
          for (const excelHeader in fieldMapping) {
            const dbField = fieldMapping[excelHeader];
            if (dbField && dbField !== "ignore") {
              // 'ignore' یک گزینه برای عدم نگاشت فیلد است
              mappedRow[dbField] = row[excelHeader];
            }
          }
          return mappedRow;
        });

        const response = await api.post(
          "/customers/upload-customers",
          processedData,
        );
        const result = await response.json();

        if (response.ok) {
          // پاسخ موفقیت‌آمیز از بک‌اند
          setUploadStatus(
            `بارگذاری ${result.createdCustomers.length} مشتری با موفقیت انجام شد.`,
          );
          setUploadedCustomers(result.createdCustomers || []);
          setUploadErrors([]);

          // ریست کردن فرم پس از بارگذاری موفق
          setFile(null);
          setExcelHeaders([]);
          setFieldMapping({});
        } else {
          // خطای دریافت شده از بک‌اند
          setUploadStatus(
            `خطا در بارگذاری: ${result.message || "خطای ناشناخته"}`,
          );
          setUploadErrors(result.errors || []);
          setUploadedCustomers(result.createdCustomers || []); // ممکن است برخی با موفقیت بارگذاری شده باشند
          console.error("API Upload Error:", result);
        }
      } catch (error) {
        setUploadStatus(`خطای داخلی در پردازش فایل: ${error.message}`);
        console.error("Internal processing error:", error);
        setUploadErrors([
          { message: `خطای داخلی در پردازش فایل: ${error.message}` },
        ]);
      }
    };
    reader.onerror = (error) => {
      setUploadStatus("خطا در خواندن فایل.");
      console.error("File reading error:", error);
      setUploadErrors([{ message: "خطای دسترسی به فایل." }]);
    };
    reader.readAsBinaryString(file);
  };
  const styles = {
    overlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)", // پس‌زمینه تیره شفاف
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999, // روی همه چیز باشد
      backdropFilter: "blur(4px)", // تار کردن پس‌زمینه
    },
    modalContainer: {
      backgroundColor: "#ffffff",
      width: "90%",
      maxWidth: "750px", // کمی عرض بیشتر برای زیبایی
      borderRadius: "16px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
      padding: "30px",
      position: "relative",
      fontFamily: "Arial, sans-serif",
      maxHeight: "90vh", // اگر محتوا زیاد شد اسکرول شود
      overflowY: "auto",
      textAlign: "center",
    },
    closeButton: {
      position: "absolute",
      top: "15px",
      right: "15px",
      background: "none",
      border: "none",
      fontSize: "24px",
      cursor: "pointer",
      color: "#888",
      fontWeight: "bold",
    },
    dragArea: {
      border: "2px dashed #4CAF50", // سبز جذاب‌تر
      padding: "40px 20px",
      borderRadius: "12px",
      cursor: "pointer",
      marginBottom: "20px",
      backgroundColor: isDragActive ? "#e8f5e9" : "#fafafa",
      transition: "all 0.3s ease",
    },
    header: {
      marginTop: "0",
      marginBottom: "20px",
      color: "#333",
      fontSize: "1.5rem",
      fontWeight: "600",
    },
    mappingGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", // ریسپانسیو
      gap: "12px",
      marginBottom: "25px",
      padding: "15px",
      backgroundColor: "#f9f9f9",
      borderRadius: "8px",
      border: "1px solid #eee",
    },
    mappingItem: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      backgroundColor: "#fff",
      borderRadius: "6px",
      border: "1px solid #eee",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    },
    selectBox: {
      padding: "6px 10px",
      borderRadius: "6px",
      border: "1px solid #ddd",
      backgroundColor: "#fff",
      outline: "none",
      cursor: "pointer",
    },
    uploadButton: {
      padding: "12px 40px",
      fontSize: "16px",
      fontWeight: "bold",
      backgroundColor: "#4CAF50",
      color: "white",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "background-color 0.3s ease, transform 0.1s",
      boxShadow: "0 4px 6px rgba(76, 175, 80, 0.3)",
    },
    statusText: {
      marginTop: "20px",
      fontWeight: "bold",
      fontSize: "16px",
    },
    listSection: {
      marginTop: "25px",
      textAlign: "left",
      backgroundColor: "#f4f8fb",
      padding: "15px",
      borderRadius: "8px",
      border: "1px solid #e1e8ed",
    },
    listItem: {
      borderBottom: "1px solid #eee",
      padding: "8px 0",
      fontSize: "14px",
      color: "#555",
    },
    errorItem: {
      marginBottom: "8px",
      color: "#d32f2f",
      fontSize: "14px",
      display: "flex",
      justifyContent: "space-between",
    },
  };
  const onClose2 = () => {
    // ریست کردن تمام حالت‌ها و داده‌ها
    setFile(null);
    setExcelHeaders([]);
    setFieldMapping({});
    setUploadStatus("");
    setUploadedCustomers([]);
    setUploadErrors([]);
    // فراخوانی تابع onClose از props برای بستن دیالوگ
    if (typeof onClose === "function") {
      onClose();
    }
  };
  return (
    <div style={styles.overlay} onClick={onClose}>
      {/* کلیک روی پس‌زمینه دیالوگ را می‌بندد */}
      <div style={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        {/* دکمه بستن */}
        <button style={styles.closeButton} onClick={onClose2}>
          &times;
        </button>

        <h2 style={styles.header}>بارگذاری فایل اکسل</h2>

        {/* --- درگ و دراپ --- */}
        <div {...getRootProps()} style={styles.dragArea}>
          <input {...getInputProps()} />
          {isDragActive ? (
            <p style={{ margin: 0, color: "#4CAF50", fontWeight: "bold" }}>
              فایل را رها کنید...
            </p>
          ) : (
            <p style={{ margin: 0, color: "#666" }}>
              فایل اکسل را اینجا بکشید و رها کنید <br />
              <span style={{ fontSize: "12px", color: "#999" }}>
                یا برای انتخاب کلیک کنید
              </span>
            </p>
          )}
        </div>

        {file && (
          <div>
            <p style={{ marginBottom: "20px", color: "#555" }}>
              فایل انتخاب شده:{" "}
              <strong style={{ color: "#4CAF50" }}>{file.name}</strong>
            </p>

            {/* --- نگاشت فیلدها --- */}
            <h3
              style={{
                textAlign: "left",
                fontSize: "1.1rem",
                color: "#444",
                marginBottom: "10px",
              }}
            >
              نگاشت فیلدها
            </h3>
            <div style={styles.mappingGrid}>
              {excelHeaders.map((header) => (
                <div key={header} style={styles.mappingItem}>
                  <span style={{ fontWeight: "500", color: "#333" }}>
                    {header}
                  </span>
                  <select
                    value={fieldMapping[header] || "ignore"}
                    onChange={(e) => handleFieldChange(header, e.target.value)}
                    style={styles.selectBox}
                  >
                    <option value="ignore">نادیده گرفتن</option>
                    {dbFields.map((dbField) => (
                      <option key={dbField} value={dbField}>
                        {dbField}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* --- دکمه ارسال --- */}
            <button
              onClick={handleUpload}
              style={styles.uploadButton}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#45a049")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#4CAF50")
              }
            >
              شروع بارگذاری
            </button>
          </div>
        )}

        {/* --- نمایش وضعیت بارگذاری --- */}
        {uploadStatus && (
          <p
            style={{
              ...styles.statusText,
              color: uploadStatus.startsWith("خطا") ? "#f44336" : "#3f51b5",
            }}
          >
            {uploadStatus}
          </p>
        )}

        {/* --- نمایش مشتریان بارگذاری شده --- */}
        {uploadedCustomers.length > 0 && (
          <div style={styles.listSection}>
            <h4
              style={{
                color: "#2e7d32",
                margin: "0 0 10px 0",
                fontSize: "16px",
              }}
            >
              مشتریان با موفقیت بارگذاری شده:{" "}
              <span style={{ fontWeight: "bold" }}>
                ({uploadedCustomers.length})
              </span>
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {uploadedCustomers.slice(0, 5).map((customer, index) => (
                <li key={index} style={styles.listItem}>
                  {customer.fullName ||
                    customer.username ||
                    `مشتری ${index + 1}`}
                </li>
              ))}
              {uploadedCustomers.length > 5 && (
                <li
                  style={{
                    ...styles.listItem,
                    borderBottom: "none",
                    color: "#777",
                    fontStyle: "italic",
                  }}
                >
                  ... و {uploadedCustomers.length - 5} مشتری دیگر
                </li>
              )}
            </ul>
          </div>
        )}

        {/* --- نمایش خطاها --- */}
        {uploadErrors.length > 0 && (
          <div
            style={{
              ...styles.listSection,
              backgroundColor: "#fff5f5",
              borderColor: "#ffcdd2",
            }}
          >
            <h4
              style={{
                color: "#c62828",
                margin: "0 0 10px 0",
                fontSize: "16px",
              }}
            >
              خطاهای بارگذاری:{" "}
              <span style={{ fontWeight: "bold" }}>
                ({uploadErrors.length})
              </span>
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {uploadErrors.slice(0, 5).map((error, index) => (
                <li key={index} style={styles.errorItem}>
                  <span>
                    <strong>
                      {error.customer?.username ||
                        error.customer?.fullName ||
                        `خطای ${index + 1}`}
                    </strong>
                  </span>
                  <span style={{ color: "#e57373", fontSize: "13px" }}>
                    {error.message || "خطای ناشناخته"}
                  </span>
                </li>
              ))}
              {uploadErrors.length > 5 && (
                <li
                  style={{
                    ...styles.listItem,
                    borderBottom: "none",
                    color: "#777",
                    fontStyle: "italic",
                  }}
                >
                  ... و {uploadErrors.length - 5} خطای دیگر
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExcelUploader;
