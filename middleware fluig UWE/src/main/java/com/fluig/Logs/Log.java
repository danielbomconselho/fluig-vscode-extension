package com.fluig.Logs;

import org.jboss.logging.Logger;
public class Log {
    private static final Logger Log = Logger.getLogger(Log.class.getName());

    public void info(String msg) {
        Log.info(msg);
    }
    public void warn(String msg) {
        Log.warn(msg);
    }
    public void error(String msg) {
        Log.error(msg);
    }

}