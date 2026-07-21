// Το pdfmake δεν συνοδεύεται από τύπους για τα browser builds (build/pdfmake,
// build/vfs_fonts). Τα φορτώνουμε δυναμικά στον client· εδώ δηλώνονται ως any.
declare module 'pdfmake/build/pdfmake';
declare module 'pdfmake/build/vfs_fonts';
