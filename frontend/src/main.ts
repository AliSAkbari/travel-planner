import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Starts the app. There is no zone.js: Angular 22 apps are zoneless by default, so
// change detection runs when signals, template events or HTTP responses change
// state, not after every browser event (see the autofill note in login.page.html).
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
