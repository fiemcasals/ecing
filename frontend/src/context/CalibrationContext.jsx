import React, { createContext, useContext, useState, useEffect } from 'react';

const CalibrationContext = createContext();

export function CalibrationProvider({ children }) {
    const [isCalibrated, setIsCalibrated] = useState(false);
    const [worldRotation, setWorldRotation] = useState(0);
    const [savedPoints, setSavedPoints] = useState([
        { id: 'p1', name: 'Punto 1', lat: -34.574207, lon: -58.435736 },
        { id: 'p2', name: 'Punto 2', lat: -34.574168, lon: -58.435714 }
    ]);
    
    const [calibSteps, setCalibSteps] = useState({
        pointA: null, // { lat, lon, xrX, xrZ }
        pointB: null
    });

    // Persist calibration and points
    useEffect(() => {
        const savedCalib = sessionStorage.getItem('ar_calibration');
        if (savedCalib) {
            const data = JSON.parse(savedCalib);
            setIsCalibrated(data.isCalibrated);
            setWorldRotation(data.worldRotation);
        }
        const customPoints = localStorage.getItem('ar_saved_points');
        if (customPoints) {
            setSavedPoints(prev => [...prev, ...JSON.parse(customPoints)]);
        }
    }, []);

    const addSavedPoint = (newPoint) => {
        const updated = [...savedPoints, { ...newPoint, id: Date.now().toString() }];
        setSavedPoints(updated);
        // Only persist custom points
        const custom = updated.filter(p => p.id !== 'p1' && p.id !== 'p2');
        localStorage.setItem('ar_saved_points', JSON.stringify(custom));
    };

    const updateCalibration = (rotation) => {
        setIsCalibrated(true);
        setWorldRotation(rotation);
        sessionStorage.setItem('ar_calibration', JSON.stringify({ isCalibrated: true, worldRotation: rotation }));
    };

    const resetCalibration = () => {
        setIsCalibrated(false);
        setWorldRotation(0);
        setCalibSteps({ pointA: null, pointB: null });
        sessionStorage.removeItem('ar_calibration');
    };

    return (
        <CalibrationContext.Provider value={{ 
            isCalibrated, 
            worldRotation, 
            updateCalibration, 
            resetCalibration,
            savedPoints,
            addSavedPoint,
            calibSteps,
            setCalibSteps
        }}>
            {children}
        </CalibrationContext.Provider>
    );
}

export const useCalibration = () => useContext(CalibrationContext);
