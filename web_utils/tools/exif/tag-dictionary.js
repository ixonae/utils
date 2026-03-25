// Comprehensive EXIF tag dictionary
// Maps tag IDs to human-readable names, grouped by IFD

/** Tag definitions for IFD0 (primary image) and IFD1 (thumbnail) directories. */
const IFD0_TAGS = {
    0x010E: { name: 'ImageDescription', group: 'Image' },
    0x010F: { name: 'Make', group: 'Camera' },
    0x0110: { name: 'Model', group: 'Camera' },
    0x0112: { name: 'Orientation', group: 'Image' },
    0x011A: { name: 'XResolution', group: 'Image' },
    0x011B: { name: 'YResolution', group: 'Image' },
    0x0128: { name: 'ResolutionUnit', group: 'Image' },
    0x0131: { name: 'Software', group: 'Image' },
    0x0132: { name: 'DateTime', group: 'Date' },
    0x013B: { name: 'Artist', group: 'Author' },
    0x013E: { name: 'WhitePoint', group: 'Image' },
    0x013F: { name: 'PrimaryChromaticities', group: 'Image' },
    0x0211: { name: 'YCbCrCoefficients', group: 'Image' },
    0x0213: { name: 'YCbCrPositioning', group: 'Image' },
    0x0214: { name: 'ReferenceBlackWhite', group: 'Image' },
    0x8298: { name: 'Copyright', group: 'Author' },
    0x8769: { name: 'ExifIFDPointer', group: '_pointer' },
    0x8825: { name: 'GPSInfoIFDPointer', group: '_pointer' },
};

/** Tag definitions for the Exif sub-IFD (camera/exposure settings, dates, etc.). */
const EXIF_TAGS = {
    0x829A: { name: 'ExposureTime', group: 'Camera' },
    0x829D: { name: 'FNumber', group: 'Camera' },
    0x8822: { name: 'ExposureProgram', group: 'Camera' },
    0x8824: { name: 'SpectralSensitivity', group: 'Camera' },
    0x8827: { name: 'ISOSpeedRatings', group: 'Camera' },
    0x8828: { name: 'OECF', group: 'Camera' },
    0x8830: { name: 'SensitivityType', group: 'Camera' },
    0x8831: { name: 'StandardOutputSensitivity', group: 'Camera' },
    0x8832: { name: 'RecommendedExposureIndex', group: 'Camera' },
    0x9000: { name: 'ExifVersion', group: 'Exif' },
    0x9003: { name: 'DateTimeOriginal', group: 'Date' },
    0x9004: { name: 'DateTimeDigitized', group: 'Date' },
    0x9010: { name: 'OffsetTime', group: 'Date' },
    0x9011: { name: 'OffsetTimeOriginal', group: 'Date' },
    0x9012: { name: 'OffsetTimeDigitized', group: 'Date' },
    0x9101: { name: 'ComponentsConfiguration', group: 'Image' },
    0x9102: { name: 'CompressedBitsPerPixel', group: 'Image' },
    0x9201: { name: 'ShutterSpeedValue', group: 'Camera' },
    0x9202: { name: 'ApertureValue', group: 'Camera' },
    0x9203: { name: 'BrightnessValue', group: 'Camera' },
    0x9204: { name: 'ExposureBiasValue', group: 'Camera' },
    0x9205: { name: 'MaxApertureValue', group: 'Camera' },
    0x9206: { name: 'SubjectDistance', group: 'Camera' },
    0x9207: { name: 'MeteringMode', group: 'Camera' },
    0x9208: { name: 'LightSource', group: 'Camera' },
    0x9209: { name: 'Flash', group: 'Camera' },
    0x920A: { name: 'FocalLength', group: 'Camera' },
    0x9214: { name: 'SubjectArea', group: 'Camera' },
    0x927C: { name: 'MakerNote', group: 'Vendor' },
    0x9286: { name: 'UserComment', group: 'Author' },
    0x9290: { name: 'SubSecTime', group: 'Date' },
    0x9291: { name: 'SubSecTimeOriginal', group: 'Date' },
    0x9292: { name: 'SubSecTimeDigitized', group: 'Date' },
    0xA000: { name: 'FlashpixVersion', group: 'Exif' },
    0xA001: { name: 'ColorSpace', group: 'Image' },
    0xA002: { name: 'PixelXDimension', group: 'Image' },
    0xA003: { name: 'PixelYDimension', group: 'Image' },
    0xA004: { name: 'RelatedSoundFile', group: 'Exif' },
    0xA005: { name: 'InteroperabilityIFDPointer', group: '_pointer' },
    0xA20B: { name: 'FlashEnergy', group: 'Camera' },
    0xA20E: { name: 'FocalPlaneXResolution', group: 'Camera' },
    0xA20F: { name: 'FocalPlaneYResolution', group: 'Camera' },
    0xA210: { name: 'FocalPlaneResolutionUnit', group: 'Camera' },
    0xA214: { name: 'SubjectLocation', group: 'Camera' },
    0xA215: { name: 'ExposureIndex', group: 'Camera' },
    0xA217: { name: 'SensingMethod', group: 'Camera' },
    0xA300: { name: 'FileSource', group: 'Exif' },
    0xA301: { name: 'SceneType', group: 'Exif' },
    0xA302: { name: 'CFAPattern', group: 'Camera' },
    0xA401: { name: 'CustomRendered', group: 'Camera' },
    0xA402: { name: 'ExposureMode', group: 'Camera' },
    0xA403: { name: 'WhiteBalance', group: 'Camera' },
    0xA404: { name: 'DigitalZoomRatio', group: 'Camera' },
    0xA405: { name: 'FocalLengthIn35mmFilm', group: 'Camera' },
    0xA406: { name: 'SceneCaptureType', group: 'Camera' },
    0xA407: { name: 'GainControl', group: 'Camera' },
    0xA408: { name: 'Contrast', group: 'Camera' },
    0xA409: { name: 'Saturation', group: 'Camera' },
    0xA40A: { name: 'Sharpness', group: 'Camera' },
    0xA40C: { name: 'SubjectDistanceRange', group: 'Camera' },
    0xA420: { name: 'ImageUniqueID', group: 'Image' },
    0xA430: { name: 'CameraOwnerName', group: 'Author' },
    0xA431: { name: 'BodySerialNumber', group: 'Camera' },
    0xA432: { name: 'LensSpecification', group: 'Lens' },
    0xA433: { name: 'LensMake', group: 'Lens' },
    0xA434: { name: 'LensModel', group: 'Lens' },
    0xA435: { name: 'LensSerialNumber', group: 'Lens' },
};

/** Tag definitions for the GPS sub-IFD (geolocation, altitude, timestamps, etc.). */
const GPS_TAGS = {
    0x0000: { name: 'GPSVersionID', group: 'GPS' },
    0x0001: { name: 'GPSLatitudeRef', group: 'GPS' },
    0x0002: { name: 'GPSLatitude', group: 'GPS' },
    0x0003: { name: 'GPSLongitudeRef', group: 'GPS' },
    0x0004: { name: 'GPSLongitude', group: 'GPS' },
    0x0005: { name: 'GPSAltitudeRef', group: 'GPS' },
    0x0006: { name: 'GPSAltitude', group: 'GPS' },
    0x0007: { name: 'GPSTimeStamp', group: 'GPS' },
    0x0008: { name: 'GPSSatellites', group: 'GPS' },
    0x0009: { name: 'GPSStatus', group: 'GPS' },
    0x000A: { name: 'GPSMeasureMode', group: 'GPS' },
    0x000B: { name: 'GPSDOP', group: 'GPS' },
    0x000C: { name: 'GPSSpeedRef', group: 'GPS' },
    0x000D: { name: 'GPSSpeed', group: 'GPS' },
    0x000E: { name: 'GPSTrackRef', group: 'GPS' },
    0x000F: { name: 'GPSTrack', group: 'GPS' },
    0x0010: { name: 'GPSImgDirectionRef', group: 'GPS' },
    0x0011: { name: 'GPSImgDirection', group: 'GPS' },
    0x0012: { name: 'GPSMapDatum', group: 'GPS' },
    0x0013: { name: 'GPSDestLatitudeRef', group: 'GPS' },
    0x0014: { name: 'GPSDestLatitude', group: 'GPS' },
    0x0015: { name: 'GPSDestLongitudeRef', group: 'GPS' },
    0x0016: { name: 'GPSDestLongitude', group: 'GPS' },
    0x0017: { name: 'GPSDestBearingRef', group: 'GPS' },
    0x0018: { name: 'GPSDestBearing', group: 'GPS' },
    0x0019: { name: 'GPSDestDistanceRef', group: 'GPS' },
    0x001A: { name: 'GPSDestDistance', group: 'GPS' },
    0x001B: { name: 'GPSProcessingMethod', group: 'GPS' },
    0x001C: { name: 'GPSAreaInformation', group: 'GPS' },
    0x001D: { name: 'GPSDateStamp', group: 'GPS' },
    0x001E: { name: 'GPSDifferential', group: 'GPS' },
    0x001F: { name: 'GPSHPositioningError', group: 'GPS' },
};

/** Tag definitions for the Interoperability sub-IFD (format compatibility info). */
const INTEROP_TAGS = {
    0x0001: { name: 'InteroperabilityIndex', group: 'Interop' },
    0x0002: { name: 'InteroperabilityVersion', group: 'Interop' },
};

/**
 * Looks up a tag definition by its numeric ID and IFD name.
 * @param {number} tagId - The EXIF tag ID (e.g. 0x010F).
 * @param {string} ifdName - The IFD name ('IFD0', 'IFD1', 'ExifIFD', 'GPSIFD', or 'InteropIFD').
 * @returns {{ name: string, group: string } | undefined} The tag definition, or undefined if not found.
 */
function lookupTag(tagId, ifdName) {
    switch (ifdName) {
        case 'IFD0':
        case 'IFD1':
            return IFD0_TAGS[tagId];
        case 'ExifIFD':
            return EXIF_TAGS[tagId];
        case 'GPSIFD':
            return GPS_TAGS[tagId];
        case 'InteropIFD':
            return INTEROP_TAGS[tagId];
        default:
            return undefined;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { lookupTag, IFD0_TAGS, EXIF_TAGS, GPS_TAGS, INTEROP_TAGS };
}
