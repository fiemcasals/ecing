import React, { createContext, useContext, useState, useEffect } from 'react';

const CalibrationContext = createContext();

export function CalibrationProvider({ children }) {
    const [isCalibrated, setIsCalibrated] = useState(false);
    const [worldRotation, setWorldRotation] = useState(0);
    const [isAccuracyGood, setIsAccuracyGood] = useState(false);
    const [lastLoc, setLastLoc] = useState(null);

    // Persist calibration in session storage so it survives page navigation
    useEffect(() => {
        const saved = sessionStorage.getItem('ar_calibration');
        if (saved) {
            const data = JSON.parse(saved);
            setIsCalibrated(data.isCalibrated);
            setWorldRotation(data.worldRotation);
        }
    }, []);

    const updateCalibration = (rotation) => {
        setIsCalibrated(true);
        setWorldRotation(rotation);
        sessionStorage.setItem('ar_calibration', JSON.stringify({ isCalibrated: true, worldRotation: rotation }));
    };

    const resetCalibration = () => {
        setIsCalibrated(false);
        setWorldRotation(0);
        sessionStorage.removeItem('ar_calibration');
    };

    return (
        <CalibrationContext.Provider value={{ 
            isCalibrated, 
            worldRotation, 
            updateCalibration, 
            resetCalibration,
            isAccuracyGood,
            setIsAccuracyGood,
            lastLoc,
            setLastLoc
        }}>
            {children}
        </CalibrationContext.Provider>
    );
}

export const useCalibration = () => useContext(CalibrationContext);
