#!/usr/bin/env python3
"""Build Lambda deployment packages."""

import os
import shutil
import zipfile
from pathlib import Path


def build_lambda_package(lambda_name: str, site_packages_dir: str, output_dir: str):
    """Build a Lambda deployment package.

    Args:
        lambda_name: Name of the Lambda function (e.g., 'lambda_fetch_raw').
        site_packages_dir: Directory containing installed Python packages.
        output_dir: Directory to write the ZIP file to.
    """
    print(f"Building {lambda_name}...")

    # Create temporary directory
    temp_dir = Path(output_dir) / f"{lambda_name}_temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Copy Lambda handler files
        lambda_dir = Path(lambda_name)
        if (lambda_dir / "handler.py").exists():
            shutil.copy2(lambda_dir / "handler.py", temp_dir / "handler.py")
        if (lambda_dir / "__init__.py").exists():
            shutil.copy2(lambda_dir / "__init__.py", temp_dir / "__init__.py")

        # Copy common package
        common_dir = Path("common")
        if common_dir.exists():
            shutil.copytree(common_dir, temp_dir / "common", dirs_exist_ok=True)

        # Copy dependencies from site-packages
        site_packages = Path(site_packages_dir)
        if site_packages.exists():
            # Copy only the packages we need
            packages_to_copy = [
                "pydantic",
                "pydantic_core",
                "pydantic_settings",
                "typing_extensions",
                "typing_inspection",
                "annotated_types",
                "requests",
                "urllib3",
                "charset_normalizer",
                "idna",
                "certifi",
                "pandas",
                "numpy",
                "pytz",
                "python_dateutil",
                "dateutil",
                "tzdata",
                "six",
                "openai",
            ]

            for pkg in packages_to_copy:
                # Try exact match first
                pkg_path = site_packages / pkg
                if pkg_path.exists():
                    if pkg_path.is_dir():
                        shutil.copytree(pkg_path, temp_dir / pkg, dirs_exist_ok=True)
                    else:
                        shutil.copy2(pkg_path, temp_dir / pkg)

                # Also copy .dist-info directories
                for dist_info in site_packages.glob(f"{pkg}*.dist-info"):
                    shutil.copytree(dist_info, temp_dir / dist_info.name, dirs_exist_ok=True)

            # Copy numpy.libs if it exists
            numpy_libs = site_packages.parent / "numpy.libs"
            if numpy_libs.exists():
                shutil.copytree(numpy_libs, temp_dir / "numpy.libs", dirs_exist_ok=True)

        # Create ZIP file
        zip_path = Path(output_dir) / f"{lambda_name}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(temp_dir)
                    zipf.write(file_path, arcname)

        print(f"✓ Built {zip_path}")

    finally:
        # Clean up temp directory
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


def main():
    """Main build function."""
    import sys

    site_packages = sys.argv[1] if len(sys.argv) > 1 else "packages"
    output_dir = "dist"

    # Create output directory
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Build each Lambda
    lambdas = ["lambda_fetch_raw", "lambda_process_metrics", "lambda_generate_explanation"]

    for lambda_name in lambdas:
        build_lambda_package(lambda_name, site_packages, output_dir)

    print(f"\n✓ All Lambda packages built successfully in {output_dir}/")


if __name__ == "__main__":
    main()

