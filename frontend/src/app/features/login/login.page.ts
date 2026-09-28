import { HttpErrorResponse } from '@angular/common/http';
import { Component, type ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { safeReturnUrl } from '../../core/auth/auth.guard';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../shared/loadable';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params, bound as inputs (withComponentInputBinding). */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  // Non-nullable: reset() restores '' instead of null, so values are always strings.
  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  private readonly usernameInput =
    viewChild.required<ElementRef<HTMLInputElement>>('usernameInput');
  private readonly passwordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    this.syncAutofilledValues();
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // show "required" messages
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(loginErrorMessage(err));
      },
    });
  }

  /**
   * Copies what is actually in the inputs into the form. Browsers and password
   * managers sometimes fill fields without firing the "input" event the form
   * listens to, which would leave the form thinking the fields are empty.
   * Submitting is a user action, so the filled values are readable by now.
   */
  private syncAutofilledValues(): void {
    const pairs = [
      [this.form.controls.username, this.usernameInput()],
      [this.form.controls.password, this.passwordInput()],
    ] as const;
    for (const [control, input] of pairs) {
      const domValue = input.nativeElement.value;
      if (domValue !== control.value) control.setValue(domValue);
    }
  }
}

/** Login-specific wording; anything else falls back to the shared message. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'Invalid username or password.';
    if (error.status === 429)
      return 'Too many failed attempts. Please wait 15 minutes and try again.';
  }
  return errorMessage(error);
}
