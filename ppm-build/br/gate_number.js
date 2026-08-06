(function executeRule(current, previous) {

    // Auto-number new gates using the sys_number record for u_pm_gates (GATE0010000+).
    if (current.u_number) { return; }
    current.u_number = new NumberManager("u_pm_gates").getNextObjNumberPadded();

})(current, previous);
