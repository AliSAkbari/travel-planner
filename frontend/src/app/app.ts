import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { displayName } from './shared/display-name';

/** The app shell: toolbar with the session controls, the routed page, and data credits. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** "Demo" for display; null when logged out (hides the session controls). */
  protected readonly userLabel = computed(() => {
    const username = this.auth.username();
    return username ? displayName(username) : null;
  });

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
