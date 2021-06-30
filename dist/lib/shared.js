"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusCode = exports.ReadyState = void 0;
var ReadyState;
(function (ReadyState) {
    ReadyState[ReadyState["CONNECTING"] = 0] = "CONNECTING";
    ReadyState[ReadyState["OPEN"] = 1] = "OPEN";
    ReadyState[ReadyState["CLOSING"] = 2] = "CLOSING";
    ReadyState[ReadyState["CLOSED"] = 3] = "CLOSED";
})(ReadyState = exports.ReadyState || (exports.ReadyState = {}));
;
var StatusCode;
(function (StatusCode) {
    StatusCode[StatusCode["NORMAL"] = 1000] = "NORMAL";
    StatusCode[StatusCode["GOING_AWAY"] = 1001] = "GOING_AWAY";
    StatusCode[StatusCode["PROTOCOL_ERROR"] = 1002] = "PROTOCOL_ERROR";
    StatusCode[StatusCode["DATA_TYPE_NOT_ACCEPTED"] = 1003] = "DATA_TYPE_NOT_ACCEPTED";
    StatusCode[StatusCode["RESERVED_1004"] = 1004] = "RESERVED_1004";
    StatusCode[StatusCode["RESERVED_1005"] = 1005] = "RESERVED_1005";
    StatusCode[StatusCode["RESERVED_1006"] = 1006] = "RESERVED_1006";
    StatusCode[StatusCode["BAD_DATA_TYPE"] = 1007] = "BAD_DATA_TYPE";
    StatusCode[StatusCode["POLICY_VIOLATION"] = 1008] = "POLICY_VIOLATION";
    StatusCode[StatusCode["MESSAGE_TOO_BIG"] = 1009] = "MESSAGE_TOO_BIG";
    StatusCode[StatusCode["CLIENT_EXPECTED_EXTENSION"] = 1010] = "CLIENT_EXPECTED_EXTENSION";
    StatusCode[StatusCode["SERVER_UNEXPECTED_CONDITION"] = 1011] = "SERVER_UNEXPECTED_CONDITION";
    StatusCode[StatusCode["RESERVED_1015"] = 1015] = "RESERVED_1015";
})(StatusCode = exports.StatusCode || (exports.StatusCode = {}));
;
