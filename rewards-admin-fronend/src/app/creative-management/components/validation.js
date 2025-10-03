import { validPIDs } from './constants';

export const validateTitle = (title, existingCreatives, currentId = null) => {
  if (!title.trim()) return "Title is required";
  if (!/^[a-zA-Z0-9\s]+$/.test(title)) return "Title must be alphanumeric only";
  if (title.length < 3) return "Title must be at least 3 characters";
  if (title.length > 50) return "Title must be less than 50 characters";
  
  const isDuplicate = existingCreatives.some(creative => 
    creative.title.toLowerCase() === title.toLowerCase() && creative.id !== currentId
  );
  if (isDuplicate) return "Title must be unique";
  
  return null;
};

export const validateFile = (file) => {
  if (!file) return "Creative file is required";
  
  const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return "Only PNG, JPG, JPEG, and WEBP files are allowed";
  }
  
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return "File size must be less than 5MB";
  }
  
  return null;
};

export const validatePID = (pid) => {
  if (!pid.trim()) return "Campaign PID is required";
  if (!/^[a-zA-Z0-9_]+$/.test(pid)) return "PID must contain only alphanumeric characters and underscores";
  if (!validPIDs.includes(pid)) return "PID must match an existing campaign";
  return null;
};

export const validateSegment = (segments) => {
  if (!segments || segments.length === 0) return "At least one target segment must be selected";
  return null;
};