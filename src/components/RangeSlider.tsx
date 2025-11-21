import React, { useState, useRef, useEffect, useCallback } from 'react';

interface RangeSliderProps {
    min: number;
    max: number;
    onChange: (range: [number, number]) => void;
    initialMin?: number;
    initialMax?: number;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({ min, max, onChange, initialMin, initialMax }) => {
    const [minVal, setMinVal] = useState(initialMin ?? min);
    const [maxVal, setMaxVal] = useState(initialMax ?? max);
    const minValRef = useRef(minVal);
    const maxValRef = useRef(maxVal);
    const range = useRef<HTMLDivElement>(null);

    // Convert to percentage
    const getPercent = useCallback(
        (value: number) => Math.round(((value - min) / (max - min)) * 100),
        [min, max]
    );

    // Set width of the range to decrease from the left side
    useEffect(() => {
        const minPercent = getPercent(minVal);
        const maxPercent = getPercent(maxValRef.current);

        if (range.current) {
            range.current.style.left = `${minPercent}%`;
            range.current.style.width = `${maxPercent - minPercent}%`;
        }
    }, [minVal, getPercent]);

    // Set width of the range to decrease from the right side
    useEffect(() => {
        const minPercent = getPercent(minValRef.current);
        const maxPercent = getPercent(maxVal);

        if (range.current) {
            range.current.style.width = `${maxPercent - minPercent}%`;
        }
    }, [maxVal, getPercent]);

    useEffect(() => {
        onChange([minVal, maxVal]);
    }, [minVal, maxVal, onChange]);

    return (
        <div className="relative w-full h-6 flex items-center">
            <input
                type="range"
                min={min}
                max={max}
                value={minVal}
                onChange={(event) => {
                    const value = Math.min(Number(event.target.value), maxVal - 1);
                    setMinVal(value);
                    minValRef.current = value;
                }}
                className="thumb thumb--left pointer-events-none absolute h-0 w-full outline-none z-30 m-0 p-0"
                style={{ zIndex: minVal > max - 10 ? 50 : undefined }}
            />
            <input
                type="range"
                min={min}
                max={max}
                value={maxVal}
                onChange={(event) => {
                    const value = Math.max(Number(event.target.value), minVal + 1);
                    setMaxVal(value);
                    maxValRef.current = value;
                }}
                className="thumb thumb--right pointer-events-none absolute h-0 w-full outline-none z-40 m-0 p-0"
            />

            <div className="relative w-full">
                <div className="absolute w-full h-1 bg-[#333] rounded z-10" />
                <div ref={range} className="absolute h-1 bg-[#00d2d3] rounded z-20" />
            </div>

            <style>{`
        .thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          -webkit-tap-highlight-color: transparent;
          pointer-events: auto;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background-color: #00d2d3;
          border: 2px solid #1a1a1a;
          cursor: pointer;
          margin-top: 1px; /* Adjust based on track height */
        }
        .thumb::-moz-range-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background-color: #00d2d3;
          border: 2px solid #1a1a1a;
          cursor: pointer;
        }
      `}</style>
        </div>
    );
};
