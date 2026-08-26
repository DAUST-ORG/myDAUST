"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { FormInputSection, FormInputField } from "@/lib/api";

interface Props {
  sections: FormInputSection[];
  onChange: (sections: FormInputSection[]) => void;
}

const FIELD_TYPES = [
  { type: "text", label: "Text Input" },
  { type: "textarea", label: "Text Area" },
  { type: "select", label: "Dropdown" },
  { type: "checkbox", label: "Checkbox" },
  { type: "date", label: "Date" },
] as const;

export default function FormBuilder({ sections, onChange }: Props) {
  const [selectedField, setSelectedField] = useState<{
    sectionIdx: number;
    fieldIdx: number;
  } | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const addSection = useCallback(() => {
    onChange([
      ...sections,
      {
        title: `Section ${sections.length + 1}`,
        sortOrder: sections.length,
        fields: [],
      },
    ]);
  }, [sections, onChange]);

  const updateSection = useCallback(
    (idx: number, patch: Partial<FormInputSection>) => {
      const next = [...sections];
      next[idx] = { ...next[idx]!, ...patch };
      onChange(next);
    },
    [sections, onChange],
  );

  const removeSection = useCallback(
    (idx: number) => {
      onChange(sections.filter((_, i) => i !== idx));
      setSelectedSection(null);
      setSelectedField(null);
    },
    [sections, onChange],
  );

  const addField = useCallback(
    (sectionIdx: number, type: string) => {
      const next = [...sections];
      const section = { ...next[sectionIdx]! };
      section.fields = [
        ...section.fields,
        {
          type,
          label: `New ${type} field`,
          required: false,
          sortOrder: section.fields.length,
        },
      ];
      next[sectionIdx] = section;
      onChange(next);
    },
    [sections, onChange],
  );

  const updateField = useCallback(
    (sectionIdx: number, fieldIdx: number, patch: Partial<FormInputField>) => {
      const next = [...sections];
      const section = { ...next[sectionIdx]! };
      const fields = [...section.fields];
      fields[fieldIdx] = { ...fields[fieldIdx]!, ...patch };
      section.fields = fields;
      next[sectionIdx] = section;
      onChange(next);
    },
    [sections, onChange],
  );

  const removeField = useCallback(
    (sectionIdx: number, fieldIdx: number) => {
      const next = [...sections];
      const section = { ...next[sectionIdx]! };
      section.fields = section.fields.filter((_, i) => i !== fieldIdx);
      next[sectionIdx] = section;
      onChange(next);
      setSelectedField(null);
    },
    [sections, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // Simple reorder within sections — find which section both belong to
      for (let si = 0; si < sections.length; si++) {
        const section = sections[si]!;
        const fields = section.fields;
        const activeIdx = fields.findIndex((f) => f.label === active.id);
        const overIdx = fields.findIndex((f) => f.label === over.id);
        if (activeIdx !== -1 && overIdx !== -1) {
          const next = [...sections];
          const nextSection = { ...section };
          const newFields = [...nextSection.fields];
          const [moved] = newFields.splice(activeIdx, 1);
          newFields.splice(overIdx, 0, moved!);
          nextSection.fields = newFields.map((f, i) => ({ ...f, sortOrder: i }));
          next[si] = nextSection;
          onChange(next);
          return;
        }
      }
    },
    [sections, onChange],
  );

  const selectedFieldData =
    selectedField && sections[selectedField.sectionIdx]
      ? sections[selectedField.sectionIdx]!.fields[selectedField.fieldIdx] ?? null
      : null;

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* Left: Palette */}
      <div
        style={{
          width: 160,
          flexShrink: 0,
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          alignSelf: "flex-start",
        }}
      >
        <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 8 }}>
          Fields
        </h3>
        {FIELD_TYPES.map((ft) => (
          <button
            key={ft.type}
            onClick={() => {
              if (selectedSection !== null) {
                addField(selectedSection, ft.type);
              } else if (sections.length > 0) {
                addField(sections.length - 1, ft.type);
              }
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 8px",
              marginBottom: 4,
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <Plus size={12} style={{ verticalAlign: -1 }} /> {ft.label}
          </button>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
        <button
          onClick={addSection}
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            padding: "8px",
            border: "1px solid var(--navy)",
            borderRadius: 4,
            background: "var(--navy)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          + Add Section
        </button>
      </div>

      {/* Center: Preview */}
      <div style={{ flex: 1 }}>
        {sections.length === 0 && (
          <p style={{ color: "var(--muted)", padding: 24, textAlign: "center" }}>
            Click "Add Section" to start building your form.
          </p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {sections.map((section, si) => (
            <div
              key={si}
              onClick={() => {
                setSelectedSection(si);
                setSelectedField(null);
              }}
              style={{
                border: `1px solid ${selectedSection === si ? "var(--navy)" : "var(--border)"}`,
                borderRadius: 8,
                padding: 14,
                marginBottom: 12,
                background: selectedSection === si ? "rgba(21,59,106,0.03)" : "var(--bg)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <GripVertical size={14} style={{ color: "var(--muted)" }} />
                <input
                  value={section.title}
                  onChange={(e) => updateSection(si, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    fontWeight: 600,
                    fontSize: 14,
                    border: "none",
                    background: "transparent",
                    outline: "none",
                  }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSection(si);
                  }}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {section.fields.length === 0 && (
                <p style={{ color: "var(--muted)", fontSize: 12, padding: 8, textAlign: "center" }}>
                  No fields. Use the palette to add fields to this section.
                </p>
              )}

              <SortableContext
                items={section.fields.map((f) => f.label)}
                strategy={verticalListSortingStrategy}
              >
                {section.fields.map((field, fi) => (
                  <SortableField
                    key={`${si}-${fi}`}
                    field={field}
                    isSelected={
                      selectedField?.sectionIdx === si && selectedField?.fieldIdx === fi
                    }
                    onClick={() => {
                      setSelectedSection(si);
                      setSelectedField({ sectionIdx: si, fieldIdx: fi });
                    }}
                  />
                ))}
              </SortableContext>
            </div>
          ))}
        </DndContext>
      </div>

      {/* Right: Properties */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          alignSelf: "flex-start",
          maxHeight: "70vh",
          overflow: "auto",
        }}
      >
        <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 8 }}>
          Properties
        </h3>
        {selectedFieldData ? (
          <FieldProperties
            field={selectedFieldData}
            onChange={(patch) => {
              if (selectedField) {
                updateField(selectedField.sectionIdx, selectedField.fieldIdx, patch);
              }
            }}
            onRemove={() => {
              if (selectedField) {
                removeField(selectedField.sectionIdx, selectedField.fieldIdx);
              }
            }}
          />
        ) : selectedSection !== null && sections[selectedSection] ? (
          <SectionProperties
            section={sections[selectedSection]}
            onChange={(patch) => updateSection(selectedSection, patch)}
          />
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Select a field or section to edit its properties.
          </p>
        )}
      </div>
    </div>
  );
}

function SortableField({
  field,
  isSelected,
  onClick,
}: {
  field: FormInputField;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.label });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    marginBottom: 4,
    border: `1px solid ${isSelected ? "var(--navy)" : "var(--border)"}`,
    borderRadius: 4,
    background: isSelected ? "rgba(21,59,106,0.05)" : "var(--bg)",
    cursor: "pointer",
    fontSize: 13,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: "grab" }}>
        <GripVertical size={12} />
      </span>
      <span style={{ flex: 1, fontWeight: 500 }}>{field.label}</span>
      <span style={{ color: "var(--muted)", fontSize: 11 }}>
        {field.type}
        {field.required ? " *" : ""}
      </span>
    </div>
  );
}

function FieldProperties({
  field,
  onChange,
  onRemove,
}: {
  field: FormInputField;
  onChange: (patch: Partial<FormInputField>) => void;
  onRemove: () => void;
}) {
  const optionsJson = field.optionsJson ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={propLabel}>Label</label>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          style={propInput}
        />
      </div>
      <div>
        <label style={propLabel}>Type</label>
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value })}
          style={propInput}
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft.type} value={ft.type}>
              {ft.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={propLabel}>
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />{" "}
          Required
        </label>
      </div>
      {field.type === "select" && (
        <div>
          <label style={propLabel}>Options</label>
          {optionsJson.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <input
                value={o.label}
                onChange={(e) => {
                  const next = [...optionsJson];
                  next[i] = { ...next[i], label: e.target.value, value: e.target.value };
                  onChange({ optionsJson: next });
                }}
                placeholder="Label"
                style={{ ...propInput, flex: 1 }}
              />
              <button
                onClick={() => {
                  onChange({ optionsJson: optionsJson.filter((_, j) => j !== i) });
                }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger)" }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              onChange({
                optionsJson: [...optionsJson, { label: "", value: "" }],
              });
            }}
            style={{ ...propInput, cursor: "pointer", fontSize: 12 }}
          >
            + Add option
          </button>
        </div>
      )}
      <button
        onClick={onRemove}
        style={{
          marginTop: 8,
          padding: "6px 10px",
          border: "1px solid var(--danger)",
          borderRadius: 4,
          background: "transparent",
          color: "var(--danger)",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        <Trash2 size={12} /> Remove field
      </button>
    </div>
  );
}

function SectionProperties({
  section,
  onChange,
}: {
  section: FormInputSection;
  onChange: (patch: Partial<FormInputSection>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={propLabel}>Section Title</label>
        <input
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          style={propInput}
        />
      </div>
      <p style={{ color: "var(--muted)", fontSize: 12 }}>
        {section.fields.length} field{section.fields.length !== 1 ? "s" : ""} in this section.
      </p>
    </div>
  );
}

const propLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--muted)",
  marginBottom: 4,
};

const propInput: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontSize: 13,
  boxSizing: "border-box",
};
