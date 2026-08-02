"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  RotateCcw,
  Code2,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write content here...",
  minHeight = 220,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showHtml, setShowHtml] = useState(false);

  // Synchronize external value with contentEditable innerHTML only if different
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand(command, false, arg);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const addLink = () => {
    const url = prompt("Enter link URL:", "https://");
    if (url) {
      exec("createLink", url);
    }
  };

  const btnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 4,
    border: "none",
    background: "transparent",
    color: "var(--fg1)",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 700,
    transition: "background 0.15s ease",
  };

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 4px",
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 2,
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <button
          type="button"
          onClick={() => exec("bold")}
          title="Bold"
          style={btnStyle}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("italic")}
          title="Italic"
          style={btnStyle}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("underline")}
          title="Underline"
          style={btnStyle}
        >
          <Underline size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("strikeThrough")}
          title="Strikethrough"
          style={btnStyle}
        >
          <Strikethrough size={15} />
        </button>

        <div style={dividerStyle} />

        <button
          type="button"
          onClick={() => exec("formatBlock", "<h2>")}
          title="Heading 2"
          style={btnStyle}
        >
          <Heading2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("formatBlock", "<h3>")}
          title="Heading 3"
          style={btnStyle}
        >
          <Heading3 size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("formatBlock", "<p>")}
          title="Paragraph"
          style={btnStyle}
        >
          P
        </button>

        <div style={dividerStyle} />

        <button
          type="button"
          onClick={() => exec("insertUnorderedList")}
          title="Bullet List"
          style={btnStyle}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("insertOrderedList")}
          title="Numbered List"
          style={btnStyle}
        >
          <ListOrdered size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("formatBlock", "<blockquote>")}
          title="Quote"
          style={btnStyle}
        >
          <Quote size={15} />
        </button>

        <div style={dividerStyle} />

        <button
          type="button"
          onClick={addLink}
          title="Insert Link"
          style={btnStyle}
        >
          <LinkIcon size={15} />
        </button>
        <button
          type="button"
          onClick={() => exec("removeFormat")}
          title="Clear Formatting"
          style={btnStyle}
        >
          <RotateCcw size={15} />
        </button>

        <div style={{ marginLeft: "auto" }} />

        <button
          type="button"
          onClick={() => setShowHtml(!showHtml)}
          title={showHtml ? "Switch to Visual Editor" : "View HTML Source"}
          style={{
            ...btnStyle,
            width: "auto",
            padding: "0 8px",
            gap: 4,
            background: showHtml ? "var(--border)" : "transparent",
          }}
        >
          <Code2 size={14} />
          <span style={{ fontSize: 11 }}>{showHtml ? "Visual" : "HTML"}</span>
        </button>
      </div>

      {/* Editor Content Area */}
      {showHtml ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="<h1>HTML Content</h1>"
          style={{
            width: "100%",
            minHeight,
            padding: 12,
            border: "none",
            outline: "none",
            background: "var(--surface)",
            color: "var(--fg1)",
            fontFamily: "monospace",
            fontSize: 13,
            resize: "vertical",
          }}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          style={{
            minHeight,
            padding: 14,
            outline: "none",
            color: "var(--fg1)",
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: "var(--font-body)",
          }}
        />
      )}
    </div>
  );
}
