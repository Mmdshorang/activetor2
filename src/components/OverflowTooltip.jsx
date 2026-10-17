import React from "react";

export default function OverflowTooltip({ text, className = "", dir = "rtl" }) {
  const content = text == null || text === "" ? "-" : String(text);

  return (
    <span
      dir={dir}
      title={content}
      className={`inline-block max-w-full truncate align-bottom ${className}`.trim()}
    >
      {content}
    </span>
  );
}
