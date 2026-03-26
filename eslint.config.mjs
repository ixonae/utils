import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    {
        files: ["web_utils/**/*.js", "vitest.config.mjs"],
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            eqeqeq: "error",
            "no-var": "error",
            "prefer-const": "error",
            radix: "error",
        },
    },
    {
        files: ["web_utils/tools/**/*.js", "web_utils/shared/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                ...globals.browser,
                $: "readonly",
                renderHeader: "readonly",
                renderFooter: "readonly",
                createUploadZone: "readonly",
                createCanvasFromImage: "readonly",
                canvasToJpegArrayBuffer: "readonly",
                lsbEncode: "readonly",
                lsbDecode: "readonly",
                lsbCapacity: "readonly",
                dctEncode: "readonly",
                dctDecode: "readonly",
                dctCapacity: "readonly",
                applyVisibleWatermark: "readonly",
                buildExifBytes: "readonly",
                stripExifFromJpeg: "readonly",
                insertExifIntoJpeg: "readonly",
                parseExifFromJpeg: "readonly",
                findExifSegment: "readonly",
                parseAllExifTags: "readonly",
                lookupTag: "readonly",
                stripAllExif: "readonly",
                stripSelectedTags: "readonly",
                module: "readonly",
            },
        },
        rules: {
            "no-unused-vars": "off",
        },
    },
    {
        files: ["web_utils/tests/**/*.js", "vitest.config.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    eslintConfigPrettier,
];
