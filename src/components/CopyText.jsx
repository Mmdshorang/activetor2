const CopyText = ({ value }) => {
  const handleCopy = async () => {
    const text = typeof value === "object"
      ? JSON.stringify(value)
      : String(value || "");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-999999px";

        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-700">
        {typeof value === "object" ? JSON.stringify(value) : value || "-"}
      </span>

      <button
        onClick={handleCopy}
        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition"
      >
        کپی
      </button>
    </div>
  );
};

export default CopyText;