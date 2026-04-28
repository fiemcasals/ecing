import React, { createContext, useContext, useState, useEffect } from 'react';

const CalibrationContext = createContext();

export function CalibrationProvider({ children }) {
    const [isCalibrated, setIsCalibrated] = useState(false);
    const [worldRotation, setWorldRotation] = useState(0);

    // Restaurar calibración de la sesión actual (sessionStorage se borra al cerrar pestaña)
    useEffect(() => {
        const savedCalib = sessionStorage.getItem('ar_calibration');
        if (savedCalib) {
            const data = JSON.parse(savedCalib);
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
            resetCalibration
        }}>
            {children}
        </CalibrationContext.Provider>
    );
}

export const useCalibration = () => useContext(CalibrationContext);
