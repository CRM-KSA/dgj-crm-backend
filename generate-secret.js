'use strict';
document.getElementById('generate').addEventListener('click', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const field = document.getElementById('secret');
  field.value = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  field.focus(); field.select();
});
document.getElementById('secret').addEventListener('click', event => event.currentTarget.select());
