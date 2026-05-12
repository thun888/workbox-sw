export function getColor(weatherCode) {
    const colorMap = {
        0: "#dbdbdb",
        1: "#d2d2d2", 
        2: "#c8c8c8", 
        3: "#bfbfbf",
        4: "#b6b6b6", 
        5: "#adadad", 
        6: "#a4a4a4", 
        7: "#949494",
        8: "#838383", 
        9: "#737373", 
        10: "#626262", 
        11: "#525252"
    };
    
    return colorMap[weatherCode] || "#424242";
}