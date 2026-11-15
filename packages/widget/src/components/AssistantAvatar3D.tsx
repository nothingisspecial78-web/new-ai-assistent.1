import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeAvatarPose, type AvatarVisualState } from './avatarKinematics.ts';
import { buildAssistantAvatarModel, createContactShadowTexture } from './avatarModel.ts';

export interface AssistantAvatar3DProps {
  title: string;
  open: boolean;
  thinking?: boolean;
  sensitive?: boolean;
  celebrateTick?: number;
  accentColor?: string;
  primaryColor?: string;
  onClick: () => void;
}

function detectSoftwareWebGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function AssistantAvatar3DComponent({
  title,
  open,
  thinking = false,
  sensitive = false,
  celebrateTick = 0,
  accentColor = '#f97316',
  primaryColor = '#0f172a',
  onClick,
}: AssistantAvatar3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [visualState, setVisualState] = useState<AvatarVisualState>('idle');
  const [clickCount, setClickCount] = useState(0);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Mutable animation state stored in refs so React re-renders never tear down WebGL
  const hoveredRef = useRef(false);
  const thinkingRef = useRef(thinking);
  const sensitiveRef = useRef(sensitive);
  const clickStartMsRef = useRef<number | null>(null);
  const celebrateStartMsRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const visualStateRef = useRef<AvatarVisualState>('idle');

  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  useEffect(() => {
    sensitiveRef.current = sensitive || passwordFocused;
  }, [sensitive, passwordFocused]);

  // Global privacy gesture: close eyes and cover face whenever any password/sensitive input is focused
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isSensitiveEl = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el instanceof HTMLInputElement && el.type === 'password') return true;
      return el.getAttribute('data-guide-sensitive') === 'true' || Boolean(el.closest('[data-guide-sensitive="true"]'));
    };
    const onFocusIn = (e: FocusEvent) => {
      setPasswordFocused(isSensitiveEl(e.target));
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        setPasswordFocused(isSensitiveEl(document.activeElement));
      }, 20);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => {
    if (celebrateTick > 0) {
      celebrateStartMsRef.current = performance.now();
    }
  }, [celebrateTick]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const width = Math.max(container.clientWidth || 120, 88);
    const height = Math.max(container.clientHeight || 124, 88);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
    camera.position.set(0, 0.25, 3.85);
    camera.lookAt(0, 0.08, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 3-Point Warm Studio Lighting matching Khazna Paper + Ember Orange
    const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x1e293b, 1.18);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.25);
    keyLight.position.set(2.4, 3.6, 3.2);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xfb923c, 1.9, 12);
    rimLight.position.set(-2.2, 1.4, -1.8);
    scene.add(rimLight);

    // Build shared 3D character model (29 meshes, 15,834 triangles)
    const shadowTex = createContactShadowTexture();
    const textures: THREE.Texture[] = shadowTex ? [shadowTex] : [];
    const {
      avatarRoot,
      pedestalGroup,
      bodyGroup,
      headGroup,
      leftArmPivot,
      rightArmPivot,
      leftEye,
      rightEye,
      haloGroup,
      coreCrystal,
      matCyanGlow,
      matEyeGlow,
      geometries,
      materials,
    } = buildAssistantAvatarModel({
      accentColor,
      primaryColor,
      shadowTexture: shadowTex,
      includeContactShadow: true,
    });
    scene.add(avatarRoot);

    // Handle container resize cleanly
    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(container.clientWidth || 120, 80);
      const h = Math.max(container.clientHeight || 124, 80);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    // Animation loop with smooth damping & Software-WebGL fenceSync pacing
    let frameId = 0;
    let disposed = false;
    const startMs = performance.now();
    let lastFrameMs = startMs;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(Math.max((now - lastFrameMs) / 1000, 0.001), 0.08);
      lastFrameMs = now;
      const elapsed = (now - startMs) / 1000;

      const clickAgeSec =
        clickStartMsRef.current !== null ? (now - clickStartMsRef.current) / 1000 : null;
      const celebrateAgeSec =
        celebrateStartMsRef.current !== null ? (now - celebrateStartMsRef.current) / 1000 : null;

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const targetPose = computeAvatarPose({
        elapsed,
        clickAgeSec,
        celebrateAgeSec,
        hovered: hoveredRef.current,
        thinking: thinkingRef.current,
        pointerX: pointerRef.current.x,
        pointerY: pointerRef.current.y,
        sensitive: sensitiveRef.current,
        prefersReducedMotion,
      });

      if (visualStateRef.current !== targetPose.state) {
        visualStateRef.current = targetPose.state;
        setVisualState(targetPose.state);
      }

      const lambda = isSoftwareGl ? 18 : 11;
      bodyGroup.position.y = THREE.MathUtils.damp(bodyGroup.position.y, targetPose.bodyY - 0.05, lambda, dt);
      bodyGroup.rotation.y = THREE.MathUtils.damp(bodyGroup.rotation.y, targetPose.bodyRotY, lambda, dt);
      bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, targetPose.bodyRotX, lambda, dt);
      bodyGroup.scale.y = THREE.MathUtils.damp(bodyGroup.scale.y, targetPose.bodyScaleY, lambda, dt);

      headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, targetPose.headRotX, lambda, dt);
      headGroup.rotation.y = THREE.MathUtils.damp(headGroup.rotation.y, targetPose.headRotY, lambda, dt);
      headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetPose.headRotZ, lambda, dt);

      leftArmPivot.rotation.z = THREE.MathUtils.damp(leftArmPivot.rotation.z, targetPose.leftArmRotZ, lambda, dt);
      leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, targetPose.leftArmRotX, lambda, dt);
      rightArmPivot.rotation.z = THREE.MathUtils.damp(rightArmPivot.rotation.z, targetPose.rightArmRotZ, lambda + 4, dt);
      rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, targetPose.rightArmRotX, lambda, dt);

      haloGroup.rotation.y = targetPose.haloRotY;
      haloGroup.rotation.z = THREE.MathUtils.damp(haloGroup.rotation.z, targetPose.haloRotZ, lambda, dt);
      haloGroup.position.y = THREE.MathUtils.damp(haloGroup.position.y, targetPose.haloY, lambda, dt);

      pedestalGroup.scale.setScalar(
        THREE.MathUtils.damp(pedestalGroup.scale.x, targetPose.pedestalScale, lambda, dt)
      );
      leftEye.scale.y = THREE.MathUtils.damp(leftEye.scale.y, targetPose.eyeScaleY, 24, dt);
      rightEye.scale.y = THREE.MathUtils.damp(rightEye.scale.y, targetPose.eyeScaleY, 24, dt);

      matCyanGlow.emissiveIntensity = THREE.MathUtils.damp(
        matCyanGlow.emissiveIntensity,
        targetPose.glowIntensity,
        10,
        dt
      );
      matEyeGlow.emissiveIntensity = THREE.MathUtils.damp(
        matEyeGlow.emissiveIntensity,
        targetPose.glowIntensity + 0.35,
        10,
        dt
      );
      coreCrystal.rotation.y = elapsed * 1.8;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      envTarget.dispose();
      renderer.dispose();
    };
  }, [accentColor, primaryColor]);

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerRef.current.x = Math.max(-1, Math.min(1, nx));
    pointerRef.current.y = Math.max(-1, Math.min(1, ny));
  };

  const handleAvatarClick = () => {
    clickStartMsRef.current = performance.now();
    visualStateRef.current = 'clicked';
    setClickCount((c) => c + 1);
    setVisualState('clicked');
    onClick();
  };

  const statusText = visualState === 'sensitive'
    ? 'Eyes Closed'
    : thinking
      ? 'Thinking…'
      : open
        ? 'AI Guide'
        : 'Ask AI';

  return (
    <button
      type="button"
      data-testid="assistant-launcher"
      data-avatar-state={visualState}
      data-click-count={clickCount}
      aria-label={open ? `${title} avatar — click to wave` : `Open ${title}`}
      title={open ? 'Click avatar to wave' : `Click to open ${title}`}
      className={`aia-avatar-btn ${open ? 'aia-avatar-open' : ''}`}
      onPointerEnter={() => {
        hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        pointerRef.current = { x: 0, y: 0 };
      }}
      onPointerMove={handlePointerMove}
      onClick={handleAvatarClick}
    >
      <div
        ref={mountRef}
        data-testid="assistant-avatar-canvas-host"
        className="aia-avatar-stage"
        aria-hidden="true"
      />
      <span className="aia-avatar-label">{statusText}</span>
    </button>
  );
}

export const AssistantAvatar3D = React.memo(AssistantAvatar3DComponent, (prev, next) => {
  return (
    prev.open === next.open &&
    prev.thinking === next.thinking &&
    prev.sensitive === next.sensitive &&
    prev.celebrateTick === next.celebrateTick &&
    prev.accentColor === next.accentColor &&
    prev.primaryColor === next.primaryColor &&
    prev.title === next.title
  );
});
