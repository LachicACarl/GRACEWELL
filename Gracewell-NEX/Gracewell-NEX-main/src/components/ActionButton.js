import React from 'react';
import './ActionButton.css';

const ActionButton = ({
  label = 'Manage',
  isSplit = false,
  onClick,
  onArrowClick,
  type = 'button',
  disabled = false,
  className = '',
  ariaLabel,
  arrowAriaLabel,
  ...rest
}) => {
  if (!isSplit) {
    return (
      <button
        type={type}
        className={`gnx-action-btn gnx-action-btn-single ${className}`.trim()}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || label}
        {...rest}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`gnx-action-btn gnx-action-btn-split ${className}`.trim()}>
      <button
        type={type}
        className="gnx-action-btn-main"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || label}
      >
        {label}
      </button>
      <span className="gnx-action-btn-divider" aria-hidden="true" />
      <button
        type="button"
        className="gnx-action-btn-arrow"
        onClick={onArrowClick || onClick}
        disabled={disabled}
        aria-label={arrowAriaLabel || `${label} options`}
      >
        ▾
      </button>
    </div>
  );
};

export default ActionButton;
