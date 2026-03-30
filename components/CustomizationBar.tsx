"use client";
import { MATERIALS, MaterialId } from "@/lib/materials";
import { COLORS, ColorId } from "@/lib/colors";

interface Props {
  selectedMaterial: MaterialId;
  selectedColor: ColorId;
  onMaterialChange: (m: MaterialId) => void;
  onColorChange: (c: ColorId) => void;
}

export function CustomizationBar({
  selectedMaterial,
  selectedColor,
  onMaterialChange,
  onColorChange,
}: Props) {
  return (
    <div className="w-full space-y-3">
      {/* Material chips */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">재질</p>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(MATERIALS) as MaterialId[]).map((id) => {
            const isActive = id === selectedMaterial;
            return (
              <button
                key={id}
                onClick={() => onMaterialChange(id)}
                className={`text-xs px-3 py-1.5 rounded-full transition-all duration-150 ${
                  isActive
                    ? "bg-blue-50 text-blue-600 border border-blue-200 font-medium"
                    : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"
                }`}
              >
                {MATERIALS[id].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Color swatches */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">색상</p>
        <div className="flex gap-2">
          {(Object.keys(COLORS) as ColorId[]).map((id) => {
            const isActive = id === selectedColor;
            return (
              <button
                key={id}
                onClick={() => onColorChange(id)}
                className={`w-6 h-6 rounded-full transition-transform duration-100 ${
                  isActive ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : "hover:scale-110"
                }`}
                style={{ background: COLORS[id].swatch }}
                title={COLORS[id].label}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
